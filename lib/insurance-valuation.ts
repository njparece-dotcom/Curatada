// Insurance valuation logic for CUR-1 / CUR-4.
//
// Two responsibilities:
//   1. Research per-(module, category) insurance multipliers via Anthropic
//      with `web_search_20250305`, and cache the result in
//      `insurance_valuation_norms` (90-day TTL).
//   2. Compute a per-item `insurance_value` from a sale-price valuation (or
//      from the user's purchase price as a lower-confidence fallback) using
//      the cached norm.
//
// The compute function is pure — easy to unit-test once a framework lands.
// The research/upsert helpers wrap Anthropic + the DB.
//
// Wired into the existing valuation flow by CUR-5 (lib/valuation-handler.ts).

import Anthropic from "@anthropic-ai/sdk";
import { query, queryOne } from "@/lib/db";
import type { InsuranceValueSource } from "@/lib/types";

import { guitarInsuranceNormsPrompt } from "@/lib/collections/guitar-prompt";
import { watchInsuranceNormsPrompt } from "@/lib/collections/watch-prompt";
import { autoInsuranceNormsPrompt } from "@/lib/collections/auto-prompt";
import { iodInsuranceNormsPrompt } from "@/lib/collections/iod-prompt";

const client = new Anthropic();

// Slug used in DB rows + prompt builders. Mirrors `user_modules.module` and
// `paperwork_generations.kind`'s module concept — single source of truth here.
export type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";

// Norms older than this trigger a synchronous re-research on next access.
// Matches the 90-day cadence documented in the CUR-1 PRD's functional
// requirements.
export const NORM_TTL_DAYS = 90;
const NORM_TTL_MS = NORM_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface NormRow {
  module: ModuleSlug;
  category: string;
  multiplier: number;
  notes: string | null;
  updated_at: string;
}

interface ResearchedNorm {
  category: string;
  multiplier: number;
  notes: string;
}

// ── Per-module prompt routing ────────────────────────────────────────────────

const PROMPT_BUILDERS: Record<ModuleSlug, (categories: string[]) => string> = {
  guitars: guitarInsuranceNormsPrompt,
  watches: watchInsuranceNormsPrompt,
  automobiles: autoInsuranceNormsPrompt,
  iod: iodInsuranceNormsPrompt,
};

// ── Anthropic call with retry ────────────────────────────────────────────────
//
// Token-cost discipline matches the existing valuation handler: Haiku +
// max_tokens 1500 + max_uses 2 on web_search. Insurance norms are stable
// industry knowledge so a 2-search ceiling is plenty (often one search is
// enough to find an insurance-industry source).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AnthropicTextResponse {
  content: { type: string; text: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function callWithRetry(prompt: string, maxRetries = 3): Promise<AnthropicTextResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client.messages.create as any)({
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
      return response as AnthropicTextResponse;
    } catch (err: unknown) {
      const apiErr = err as { status?: number; headers?: Record<string, string> };
      if (apiErr?.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(apiErr.headers?.["retry-after"] ?? "60", 10);
        console.log(`[insurance-norms] rate limited; waiting ${retryAfter}s before retry ${attempt + 1}/${maxRetries}`);
        await sleep(retryAfter * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

function extractJSON(text: string): string | null {
  const cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const candidate = fence[1].trim();
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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Call Anthropic to research the per-category insurance-vs-sale-price
 * multipliers for the given module. Costs 1 Anthropic call per invocation
 * regardless of `categories.length` — the prompt asks for all of them at once.
 */
export async function researchInsuranceNorms(
  module: ModuleSlug,
  categories: string[],
): Promise<ResearchedNorm[]> {
  if (categories.length === 0) return [];

  const buildPrompt = PROMPT_BUILDERS[module];
  if (!buildPrompt) {
    throw new Error(`Unknown module: ${module}`);
  }

  const prompt = buildPrompt(categories);
  const t0 = Date.now();
  const response = await callWithRetry(prompt);
  const elapsedMs = Date.now() - t0;

  const allText = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const jsonText = extractJSON(allText);
  if (!jsonText) {
    console.error(`[insurance-norms] no JSON in response for module=${module}`, allText.slice(0, 400));
    throw new Error("Anthropic returned an unparseable response");
  }

  let parsed: { norms?: ResearchedNorm[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error(`[insurance-norms] failed to parse JSON for module=${module}`, err);
    throw new Error("Anthropic returned invalid JSON");
  }

  if (!Array.isArray(parsed.norms)) {
    throw new Error("Anthropic response missing `norms` array");
  }

  console.log(
    `[insurance-norms] researched module=${module} categories=${categories.length} ms=${elapsedMs} ` +
      `tokens_in=${response.usage?.input_tokens ?? "?"} tokens_out=${response.usage?.output_tokens ?? "?"}`,
  );

  // Defensive validation — drop entries with bogus multipliers (negative,
  // NaN, or wildly out of range) rather than persisting nonsense.
  return parsed.norms.filter((n) => {
    const m = Number(n.multiplier);
    if (!isFinite(m) || m <= 0 || m > 5) {
      console.warn(`[insurance-norms] dropping bogus norm: module=${module} category=${n.category} multiplier=${n.multiplier}`);
      return false;
    }
    return true;
  });
}

/**
 * UPSERT each researched norm into `insurance_valuation_norms`. Conflict on
 * (module, category) updates `multiplier`, `notes`, `updated_at`.
 */
export async function upsertInsuranceNorms(
  module: ModuleSlug,
  rows: ResearchedNorm[],
): Promise<void> {
  for (const row of rows) {
    await query(
      `INSERT INTO insurance_valuation_norms (module, category, multiplier, notes, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (module, category) DO UPDATE SET
         multiplier = EXCLUDED.multiplier,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [module, row.category, row.multiplier, row.notes],
    );
  }
}

/**
 * Fetch a single norm. If missing OR older than NORM_TTL_DAYS, kick off a
 * fresh research call (just for that one category) and cache the result.
 * If the research call fails but a stale row exists, return the stale row
 * (degraded mode preferred over hard-failing the parent valuation).
 */
export async function getOrResearchNorm(
  module: ModuleSlug,
  category: string,
): Promise<NormRow | null> {
  const existing = await queryOne<NormRow>(
    `SELECT module, category, multiplier::float AS multiplier, notes, updated_at
     FROM insurance_valuation_norms
     WHERE module = $1 AND category = $2`,
    [module, category],
  );

  const isFresh =
    existing && Date.now() - new Date(existing.updated_at).getTime() < NORM_TTL_MS;
  if (isFresh) return existing;

  try {
    const researched = await researchInsuranceNorms(module, [category]);
    if (researched.length > 0) {
      await upsertInsuranceNorms(module, researched);
      const updated = await queryOne<NormRow>(
        `SELECT module, category, multiplier::float AS multiplier, notes, updated_at
         FROM insurance_valuation_norms
         WHERE module = $1 AND category = $2`,
        [module, category],
      );
      return updated;
    }
    console.warn(`[insurance-norms] research returned no rows for module=${module} category=${category}; falling back to stale row (if any)`);
  } catch (err) {
    console.error(`[insurance-norms] research failed for module=${module} category=${category}`, err);
    // Fall through — stale norm beats hard failure.
  }

  return existing ?? null;
}

// ── Pure compute helper ──────────────────────────────────────────────────────

export interface InsuranceComputation {
  value: number | null;
  source: InsuranceValueSource | null;
  date: string | null;
}

/**
 * Decide an item's `insurance_value` from the inputs available.
 *
 *  - If `aiSalePrice` is present, use it × norm.multiplier ("ai" source).
 *  - Else if `userPurchasePrice` is present, use it × norm.multiplier
 *    ("alternate_from_user" source — flagged as lower confidence).
 *  - Else return all-nulls (item shows up on the insurance schedule with a
 *    "Needs valuation" notice; user can manually override or run an AI value).
 *
 * Pure function — easy to unit-test once a framework lands.
 */
export function computeInsuranceValue(
  aiSalePrice: number | null | undefined,
  userPurchasePrice: number | null | undefined,
  norm: NormRow | null,
): InsuranceComputation {
  if (!norm) return { value: null, source: null, date: null };
  const multiplier = Number(norm.multiplier);
  if (!isFinite(multiplier) || multiplier <= 0) {
    return { value: null, source: null, date: null };
  }

  if (aiSalePrice != null && isFinite(Number(aiSalePrice)) && Number(aiSalePrice) > 0) {
    return {
      value: Number(aiSalePrice) * multiplier,
      source: "ai",
      date: new Date().toISOString(),
    };
  }
  if (userPurchasePrice != null && isFinite(Number(userPurchasePrice)) && Number(userPurchasePrice) > 0) {
    return {
      value: Number(userPurchasePrice) * multiplier,
      source: "alternate_from_user",
      date: new Date().toISOString(),
    };
  }
  return { value: null, source: null, date: null };
}

// ── Module → categories registry (used by the seed script + admin route) ─────
//
// Mirrors `validCategories` from each lib/collections/*.ts config but cleaned
// up for use here. If a new category lands in a config, mirror it here so
// the seeder picks it up.

export const MODULE_CATEGORIES: Record<ModuleSlug, readonly string[]> = {
  guitars: ["electric-guitars", "acoustic-guitars", "amplifiers", "pedals"],
  watches: ["luxury-watches", "sport-watches", "dress-watches", "vintage-watches"],
  automobiles: ["collection", "household"],
  iod: ["fine-art", "memorabilia", "collectibles", "jewelry", "other"],
};
