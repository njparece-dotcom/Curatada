// Shared AI-valuation route factory for the four collection modules. The
// per-module prompt is the only thing that genuinely differs; the surrounding
// logic — auth, item lookup, Anthropic call with retry, JSON extraction,
// INSERT into <module>_valuations — is identical across guitars, watches,
// automobiles, and items of distinction.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Anthropic from "@anthropic-ai/sdk";
import { authOptions } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import type { CollectionConfig } from "@/lib/collections/types";
import type { ComparableSale } from "@/lib/types";

const client = new Anthropic();

interface ValuationResult {
  suggested_price: number;
  price_low: number;
  price_high: number;
  comparable_sales: ComparableSale[];
  analysis: string;
}

// Robustly extract a JSON object from text that may contain prose, markdown
// code fences, or multiple blocks.
function extractJSON(text: string): string | null {
  const cleaned = text.trim();

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const candidate = fence[1].trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch { /* fall through */ }
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch { /* fall through */ }
  }

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch { /* fall through */ }

  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AnthropicResponse {
  content: { type: string; text: string }[];
}

async function callWithRetry(prompt: string, maxRetries = 3): Promise<AnthropicResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client.messages.create as any)({
        // Haiku gives the same answer quality on this task as Sonnet at ~1/5
        // the per-token cost. Two web_search invocations are plenty: STEP 1
        // (sold) and an optional STEP 2 (active for-sale). max_tokens covers
        // 3-5 comparables + a 1-2 sentence analysis with headroom.
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
          },
        ],
        messages: [{ role: "user", content: prompt }],
      });
      return response as AnthropicResponse;
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

export function makeValuationHandler<T extends { id: string }>(
  c: CollectionConfig,
  buildPrompt: (item: T) => string,
) {
  // Next 15: params is now a Promise; await before reading.
  return async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { id } = await params;

      const item = await queryOne<T>(
        `SELECT * FROM ${c.table} WHERE id = $1 AND user_id = $2`,
        [id, session.user.id],
      );
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }

      const prompt = buildPrompt(item);
      const response = await callWithRetry(prompt);

      const allText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const jsonText = extractJSON(allText);
      if (!jsonText) {
        console.error(`No JSON found in AI response for ${c.label}:`, allText.slice(0, 500));
        return NextResponse.json(
          { error: "AI returned an unparseable response. Please try again." },
          { status: 502 },
        );
      }

      let parsed: ValuationResult;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        console.error(`Failed to parse extracted JSON for ${c.label}:`, jsonText.slice(0, 500));
        return NextResponse.json(
          { error: "AI returned an unparseable response. Please try again." },
          { status: 502 },
        );
      }

      const valuation = await queryOne(
        `INSERT INTO ${c.valuationsTable} (${c.valuationFkColumn}, valuation_type, price, notes, comparable_sales)
         VALUES ($1, 'ai', $2, $3, $4)
         RETURNING *`,
        [
          id,
          parsed.suggested_price,
          parsed.analysis,
          JSON.stringify(parsed.comparable_sales),
        ],
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
      console.error(`POST /api/${c.label}/[id]/value error:`, error);
      const apiErr = error as { status?: number };
      if (apiErr?.status === 429) {
        return NextResponse.json(
          { error: "Rate limit reached. Try again in a minute.", code: "rate_limited" },
          { status: 429 },
        );
      }
      return NextResponse.json({ error: "Failed to get AI valuation" }, { status: 500 });
    }
  };
}
