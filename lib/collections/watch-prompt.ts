import type { WatchItem } from "@/lib/types";

export function watchValuationPrompt(item: WatchItem): string {
  const descriptor = [item.year, item.brand, item.model, item.dial_color]
    .filter(Boolean)
    .join(" ");

  return `You are a luxury watch and timepiece valuation expert. Research the current resale market value for: ${descriptor} in ${item.condition} condition.${item.movement ? ` Movement: ${item.movement}.` : ""}${item.case_material ? ` Case: ${item.case_material}.` : ""}${item.bracelet_material ? ` Bracelet: ${item.bracelet_material}.` : ""}

STEP 1 — Search for SOLD/COMPLETED listings first:
- Search Chrono24 sold listings (use site:chrono24.com)
- Search WatchBox sold listings (use site:watchbox.com)
- Search Bob's Watches sold listings (use site:bobswatches.com)
- Search WatchCharts price history (use site:watchcharts.com)
- Search eBay completed/sold listings (use site:ebay.com "sold" or filter=completed)
- Look for sales within the last 12 months. Match year, brand, model, dial color, and condition as closely as possible.

STEP 2 — If fewer than 3 sold listings are found, supplement with ACTIVE FOR-SALE listings:
- Search Chrono24 active listings for the same watch
- Search eBay active listings
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
      "source": "Chrono24" or "WatchBox" or "Bob's Watches" or "WatchCharts" or "eBay",
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
// Watch insurance multipliers tend to cluster tighter than guitars — luxury
// watch carriers (Chubb, Jewelers Mutual) typically agree on values ~1.1-1.4×
// current market for established references; vintage rarities (especially
// dial variants) can run higher.

export function watchInsuranceNormsPrompt(categories: string[]): string {
  const categoriesJSON = JSON.stringify(categories);
  return `You are an insurance valuation expert specializing in luxury and vintage timepieces. For each category below, research the typical multiplier that an insurance scheduled value bears relative to the current open-market resale price.

Categories to research (use the exact slug strings in your response): ${categoriesJSON}

Context for each category:
- "luxury-watches": modern luxury references (Rolex, Patek, AP, etc.). Multipliers near 1.1-1.4× — supply tight, replacement cost includes acquisition friction.
- "sport-watches": divers, chronographs, racing watches. Similar range to luxury; popular models with waitlists may run higher.
- "dress-watches": classic dress pieces, often gold case. Multipliers ~1.1-1.3×.
- "vintage-watches": pre-1990 pieces. Multipliers can run higher (~1.2-1.6×) due to scarcity, condition-dependent appraisal premium, and dial-variant value.

For each category, derive a single multiplier (decimal, typically between 1.0 and 1.6).

Considerations:
- Insurance "agreed value" reflects retail replacement cost, including dealer markup and finding a comparable specimen.
- Watch carriers (Chubb, Jewelers Mutual, Hodinkee Insurance) publish typical scheduling norms — use web_search to find recent sources.
- Vintage watches with original parts/papers carry higher multipliers than service-replacement examples.
- Auction prices (Phillips, Christie's, Sotheby's, Bonhams) are useful proxies for high-end replacement cost.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "norms": [
    {
      "category": "<one of the categories above, verbatim>",
      "multiplier": <decimal, typically 1.0-1.6>,
      "notes": "<1-2 sentences citing the source or industry practice>"
    }
  ]
}

Include one entry per category requested. Omit any category for which you cannot find a defensible multiplier.`;
}
