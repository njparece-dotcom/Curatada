import type { GuitarItem } from "@/lib/types";

export function guitarValuationPrompt(item: GuitarItem): string {
  const descriptor = [item.year, item.brand, item.model, item.color_finish]
    .filter(Boolean)
    .join(" ");

  return `You are a guitar and music gear valuation expert. Research the current resale market value for: ${descriptor} in ${item.condition} condition.

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
  "analysis": "<1-2 sentences explaining the valuation, specifically mentioning whether it was based on sold listings, for-sale listings, or a mix, and how condition was factored in>"
}

Include 3-5 comparable listings total (mix of sold and for-sale is fine).`;
}

// ── Insurance norms prompt (CUR-4) ───────────────────────────────────────────
//
// Asks Anthropic to research per-category insurance-vs-sale-price multipliers
// for guitars and music gear. Returns one multiplier per category (typically
// 1.0–1.6 for guitars — replacement at retail tends to run above used resale,
// but the spread is tighter for production gear than for vintage rarities).

export function guitarInsuranceNormsPrompt(categories: string[]): string {
  const categoriesJSON = JSON.stringify(categories);
  return `You are an insurance valuation expert specializing in vintage and contemporary guitars, amplifiers, and music gear. For each category below, research the typical multiplier that an insurance scheduled value bears relative to the current open-market resale price.

Categories to research (use the exact slug strings in your response): ${categoriesJSON}

Context for each category:
- "electric-guitars": electric guitars, basses, etc. Vintage examples (pre-1980 Fender/Gibson) often carry higher multipliers than modern production.
- "acoustic-guitars": flat-tops, classical, and resonators. Boutique luthier instruments and pre-war Martins typically carry higher multipliers.
- "amplifiers": tube/solid-state amps and combos. Vintage tube amps (pre-1980) carry higher multipliers than modern production.
- "pedals": stompboxes, effects, signal processors. Mostly production gear — multipliers near 1.0; rare/boutique pedals slightly higher.

For each category, derive a single multiplier (decimal, typically between 1.0 and 1.8) representing how an insurance "agreed value" or "replacement cost" appraisal typically compares to current resale (e.g. eBay sold / Reverb sold) prices.

Considerations:
- Insurance "agreed value" reflects retail replacement cost, not used resale.
- Should account for sales tax, shipping, dealer markup, and acquisition friction (finding a comparable piece).
- For vintage / rare items, "agreed value" appraisals often run 20-50% above current resale.
- For mass-produced production gear, multipliers may be close to 1.0 (~1.05-1.15).
- Cite insurance-industry sources, appraiser norms, or instrument insurance carrier guidelines (Heritage, Clarion, Anderson, etc.) where possible — use web_search to verify recent (last 2 years) sources.

Respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "norms": [
    {
      "category": "<one of the categories above, verbatim>",
      "multiplier": <decimal, typically 1.0-1.8>,
      "notes": "<1-2 sentences citing the source or industry practice that grounds this multiplier>"
    }
  ]
}

Include one entry per category requested. If you cannot find a defensible multiplier for a category, omit it from the response rather than guessing.`;
}
