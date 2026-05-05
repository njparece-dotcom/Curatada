import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { AutoItem, ComparableSale } from "@/lib/types";

const client = new Anthropic();

function extractJSON(text: string): string | null {
  const cleaned = text.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    try { JSON.parse(candidate); return candidate; } catch { /* fall through */ }
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try { JSON.parse(candidate); return candidate; } catch { /* fall through */ }
  }

  try { JSON.parse(cleaned); return cleaned; } catch { /* fall through */ }

  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callWithRetry(prompt: string, maxRetries = 3): Promise<{ content: { type: string; text: string }[] }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client.messages.create as any)({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 4,
          },
        ],
        messages: [{ role: "user", content: prompt }],
      });
      return response;
    } catch (err: unknown) {
      const apiErr = err as { status?: number; headers?: Record<string, string>; message?: string };
      if (apiErr?.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(apiErr.headers?.["retry-after"] ?? "60", 10);
        console.log(`Rate limited. Waiting ${retryAfter}s before retry ${attempt + 1}/${maxRetries}...`);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

interface AutoValuation {
  id: string;
  auto_id: string;
  valuation_type: "ai" | "user";
  price: number;
  notes: string | null;
  comparable_sales: ComparableSale[] | null;
  created_at: string;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const item = await queryOne<AutoItem>(
      `SELECT * FROM automobiles WHERE id = $1 AND user_id = $2`,
      [params.id, session.user.id]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const descriptor = [item.year, item.brand, item.model, item.trim_level]
      .filter(Boolean)
      .join(" ");

    const mileageStr = item.mileage != null ? `${Number(item.mileage).toLocaleString()} miles` : "unknown mileage";
    const conditionStr = item.condition ?? "unknown condition";
    const bodyStr = item.body_style ?? "";
    const engineStr = item.engine ?? "";

    const prompt = `You are an automotive valuation expert. Research the current market value for: ${descriptor} with ${mileageStr} in ${conditionStr} condition.${bodyStr ? ` Body style: ${bodyStr}.` : ""}${engineStr ? ` Engine: ${engineStr}.` : ""}

STEP 1 — Search for SOLD/COMPLETED listings first:
- Search KBB (kbb.com) for current trade-in and private party values
- Search CarGurus sold/completed listings (use site:cargurus.com)
- Search AutoTrader completed listings (use site:autotrader.com)
- Look for comparable sales within the last 6 months.

STEP 2 — If fewer than 3 sold listings are found, supplement with ACTIVE FOR-SALE listings:
- Search AutoTrader active listings
- Search Cars.com active listings
- Active listings represent asking price (typically higher), note this when calculating.

PRICING LOGIC:
- If you have 3+ sold listings: base the suggested_price on the median/average of those sold prices.
- If fewer than 3 sold listings: use sold prices where available, then discount active for-sale prices by 10-15%.
- Always adjust for condition: "${conditionStr}" relative to the listings found.
- Mileage is a key factor — adjust accordingly vs comparable listings.

After researching, respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "suggested_price": <number, single best estimate>,
  "price_low": <number, low end of range>,
  "price_high": <number, high end of range>,
  "comparable_sales": [
    {
      "source": "KBB" or "CarGurus" or "AutoTrader" or "Cars.com",
      "listing_type": "sold" or "for_sale",
      "title": "<listing title>",
      "price": <number>,
      "date": "<approximate date, e.g. Feb 2025>",
      "url": "<url if available, otherwise omit>",
      "condition": "<condition if listed>"
    }
  ],
  "analysis": "<2-3 sentences explaining the valuation, specifically mentioning KBB, CarGurus, AutoTrader as comp sources, how mileage and condition were factored in>"
}

Include 3-8 comparable listings total.`;

    const response = await callWithRetry(prompt);

    const allText = response.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n");

    const jsonText = extractJSON(allText);

    if (!jsonText) {
      console.error("No JSON found in AI response:", allText.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned an unparseable response. Please try again." },
        { status: 502 }
      );
    }

    let parsed: {
      suggested_price: number;
      price_low: number;
      price_high: number;
      comparable_sales: ComparableSale[];
      analysis: string;
    };

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error("Failed to parse extracted JSON:", jsonText.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned an unparseable response. Please try again." },
        { status: 502 }
      );
    }

    const valuation = await queryOne<AutoValuation>(
      `INSERT INTO auto_valuations (auto_id, valuation_type, price, notes, comparable_sales)
       VALUES ($1, 'ai', $2, $3, $4)
       RETURNING *`,
      [
        params.id,
        parsed.suggested_price,
        parsed.analysis,
        JSON.stringify(parsed.comparable_sales),
      ]
    );

    return NextResponse.json({
      valuation,
      suggested_price: parsed.suggested_price,
      price_low: parsed.price_low,
      price_high: parsed.price_high,
      comparable_sales: parsed.comparable_sales,
      analysis: parsed.analysis,
    });
  } catch (error) {
    console.error("POST /api/automobiles/[id]/value error:", error);
    const apiErr = error as { status?: number };
    if (apiErr?.status === 429) {
      return NextResponse.json({ error: "Rate limit reached. Try again in a minute.", code: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "Failed to get AI valuation" }, { status: 500 });
  }
}
