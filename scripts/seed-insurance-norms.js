#!/usr/bin/env node

// One-shot CLI to populate `insurance_valuation_norms` for all 4 modules ×
// every supported category. Safe to re-run — UPSERTs on (module, category).
// Story CUR-4 of the Insurance Validation and Paperwork Epic (CUR-1).
//
// Usage (local):
//   node scripts/seed-insurance-norms.js
//
// Usage (production):
//   railway run node scripts/seed-insurance-norms.js
//
// Required env vars:
//   - DATABASE_URL          (Postgres connection string)
//   - ANTHROPIC_API_KEY     (Anthropic API key)
//   - NODE_ENV              ("production" enables Postgres TLS)
//
// Cost: ~4 Anthropic calls (one per module). At Haiku rates this is well
// under $1 total. The 90-day TTL means subsequent runs are essentially free
// unless you force-refresh.
//
// This script duplicates a small bit of logic from lib/insurance-valuation.ts
// rather than importing it — TypeScript files can't be require()'d from
// plain Node without a transpile step, and the seed logic is small enough
// that duplication is cheaper than tooling.

const { Pool } = require("pg");
const Anthropic = require("@anthropic-ai/sdk").default;
const path = require("path");

// Optional dotenv for local dev — production picks up env from the platform.
try {
  require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
} catch {
  // dotenv not installed in production bundle — fine.
}

// Mirror lib/insurance-valuation.ts MODULE_CATEGORIES. Keep in sync if
// either side changes.
const MODULE_CATEGORIES = {
  guitars: ["electric-guitars", "acoustic-guitars", "amplifiers", "pedals"],
  watches: ["luxury-watches", "sport-watches", "dress-watches", "vintage-watches"],
  automobiles: ["collection", "household"],
  iod: ["fine-art", "memorabilia", "collectibles", "jewelry", "other"],
};

// Module-specific prompt framing. Kept terse here; the runtime prompts in
// lib/collections/*-prompt.ts have richer per-category context for use in
// the admin route + getOrResearchNorm path.
function buildPrompt(moduleSlug, categories) {
  const categoriesJSON = JSON.stringify(categories);
  const moduleLabel = {
    guitars: "guitars, amplifiers, and music gear",
    watches: "luxury and vintage timepieces",
    automobiles: "collector and household automobiles",
    iod: "fine art, jewelry, memorabilia, and collectibles",
  }[moduleSlug];

  return `You are an insurance valuation expert specializing in ${moduleLabel}. For each category below, research and return the typical multiplier that an insurance scheduled value bears relative to current open-market resale price.

Categories (use the exact slug strings in your response): ${categoriesJSON}

For each category, derive a single multiplier (decimal between 1.0 and 2.5) reflecting how an insurance "agreed value" or "replacement cost" appraisal typically compares to current resale prices. Use web_search to verify recent (last 2 years) carrier or appraiser guidance.

Considerations:
- Insurance "agreed value" reflects retail replacement cost, not used resale.
- It accounts for sales tax, dealer markup, restoration premium, and acquisition friction.
- Mass-produced production items: multiplier near 1.0.
- Vintage / rare / collector items: multiplier 1.2-1.8.
- Jewelry and "collection" cars often run the highest (1.5-2.0+).

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "norms": [
    { "category": "<one of the slugs above>", "multiplier": <decimal>, "notes": "<1-2 sentences citing the source>" }
  ]
}

Include one entry per category. Omit any you cannot justify.`;
}

function extractJSON(text) {
  const cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { JSON.parse(fence[1].trim()); return fence[1].trim(); } catch { /* fall through */ }
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

async function researchModule(client, moduleSlug, categories) {
  const prompt = buildPrompt(moduleSlug, categories);
  const t0 = Date.now();

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    messages: [{ role: "user", content: prompt }],
  });

  const allText = (response.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const jsonText = extractJSON(allText);
  if (!jsonText) {
    throw new Error(`No JSON found in Anthropic response for module=${moduleSlug}: ${allText.slice(0, 300)}`);
  }
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed.norms)) {
    throw new Error(`Anthropic response missing 'norms' array for module=${moduleSlug}`);
  }

  const elapsedMs = Date.now() - t0;
  console.log(
    `  ↳ researched ${parsed.norms.length}/${categories.length} categories in ${elapsedMs}ms ` +
      `(tokens_in=${response.usage?.input_tokens ?? "?"} tokens_out=${response.usage?.output_tokens ?? "?"})`,
  );

  // Drop obvious garbage. Mirrors the lib/insurance-valuation.ts filter.
  return parsed.norms.filter((n) => {
    const m = Number(n.multiplier);
    if (!isFinite(m) || m <= 0 || m > 5) {
      console.warn(`  ↳ dropping bogus norm: module=${moduleSlug} category=${n.category} multiplier=${n.multiplier}`);
      return false;
    }
    return true;
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY is not set");
    process.exit(1);
  }

  const ssl = process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
  const anthropic = new Anthropic();

  let totalUpserted = 0;

  try {
    for (const [moduleSlug, categories] of Object.entries(MODULE_CATEGORIES)) {
      console.log(`\n▸ Researching ${moduleSlug} (${categories.length} categories)...`);
      let researched;
      try {
        researched = await researchModule(anthropic, moduleSlug, categories);
      } catch (err) {
        console.error(`  ↳ research failed for module=${moduleSlug}:`, err.message ?? err);
        continue;
      }

      for (const row of researched) {
        await pool.query(
          `INSERT INTO insurance_valuation_norms (module, category, multiplier, notes, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (module, category) DO UPDATE SET
             multiplier = EXCLUDED.multiplier,
             notes = EXCLUDED.notes,
             updated_at = NOW()`,
          [moduleSlug, row.category, row.multiplier, row.notes ?? null],
        );
        totalUpserted++;
        console.log(`  ✓ ${moduleSlug}/${row.category} → ${Number(row.multiplier).toFixed(3)}`);
      }
    }
  } finally {
    await pool.end();
  }

  console.log(`\n✓ Seeded ${totalUpserted} norms total.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
