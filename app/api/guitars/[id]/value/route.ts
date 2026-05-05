import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { GuitarItem, GuitarValuation, ComparableSale } from "@/lib/types";

const client = new Anthropic();

/**
 * Robustly extract a JSON object from a string that may contain
 * prose, markdown code fences, or multiple blocks.
 * Tries strategies in order:
 *   1. Strip markdown fences and parse directly
 *   2. Find the first { ... } balanced block
 */
function extractJSON(text: string): string | null {
  const cleaned = text.trim();

  // Strategy 1: strip code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    try { JSON.parse(candidate); return candidate; } catch { /* fall through */ }
  }

  // Strategy 2: find outermost { } block
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try { JSON.parse(candidate); return candidate; } catch { /* fall through */ }
  }

  // Strategy 3: plain parse (text already is pure JSON)
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

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const item = await queryOne<GuitarItem>(
      `SELECT * FROM guitar_items WHERE id = $1 AND user_id = $2`,
      [params.id, session.user.id]
    );

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const descriptor = [item.year, item.brand, item.model, item.color_finish]
      .filter(Boolean)
      .join(" ");

    const prompt = `You are a guitar and music gear valuation expert. Research the current resale market value for: ${descriptor} in ${item.condition} condition.

STEP 1 — Search for SOLD/COMPLETED listings first:
- Search eBay completed/sold listings (use site:ebay.com "sold" or filter=completed)
- Search Reverb sold listings (use site:reverb.com "sold")
- Look for sales within the last 12 months. Match year, brand, model, and condition as closely as possible.

STEP 2 — If fewer than 3 sold listings are found, supplement with ACTIVE FOR-SALE listings:
- Search eBay active listings for the same item
- Search Reverb active listings
- Active listings represent asking price (typically higher than actual sale price), so note this when calculating the estimate.

PRICING LOGIC:
- If you have 3+ sold listings: base the suggested_price on the median/average of those sold prices.
- If you have fewer than 3 sold listings: use sold prices where available, then discount active for-sale prices by 10-20% to estimate likely sale price, and average them together.
- Always adjust for condition: "${item.condition}" relative to the listings found.

After researching, respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "suggested_price": <number, single best estimate>,
  "price_low": <number, low end of range>,
  "price_high": <number, high end of range>,
  "comparable_sales": [
    {
      "source": "eBay" or "Reverb",
      "listing_type": "sold" or "for_sale",
      "title": "<listing title>",
      "price": <number>,
      "date": "<approximate date, e.g. Feb 2025>",
      "url": "<url if available, otherwise omit>",
      "condition": "<condition if listed>"
    }
  ],
  "analysis": "<2-3 sentences explaining the valuation, specifically mentioning whether it was based on sold listings, for-sale listings, or a mix, and how condition was factored in>"
}

Include 3-8 comparable listings total (mix of sold and for-sale is fine).`;

    const response = await callWithRetry(prompt);

    // Collect all text blocks from the response (model may emit multiple)
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

    // Save the valuation to DB
    const valuation = await queryOne<GuitarValuation>(
      `INSERT INTO guitar_valuations (guitar_item_id, valuation_type, price, notes, comparable_sales)
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
    console.error("POST /api/guitars/[id]/value error:", error);
    const apiErr = error as { status?: number };
    if (apiErr?.status === 429) {
      return NextResponse.json({ error: "Rate limit reached. Try again in a minute.", code: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "Failed to get AI valuation" }, { status: 500 });
  }
}
