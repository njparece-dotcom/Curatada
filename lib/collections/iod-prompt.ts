import type { IoDItem } from "@/lib/types";

export function iodValuationPrompt(item: IoDItem): string {
  const itemTypeStr = item.item_type ?? "item";
  const brandStr = item.brand ? `by ${item.brand}` : "";
  const descStr = `"${item.short_description}"`;
  const yearStr = item.year ? `from ${item.year}` : "";
  const conditionStr = item.condition ?? "unknown condition";
  const provenanceStr = item.provenance ? `Provenance: ${item.provenance}.` : "";

  return `You are an art and collectibles valuation expert. Research the current market value for this item of distinction: ${itemTypeStr} ${brandStr} ${descStr} ${yearStr} in ${conditionStr} condition. ${provenanceStr}

STEP 1 — Search for SOLD/COMPLETED auction results:
- Search Heritage Auctions sold results (site:ha.com)
- Search eBay completed/sold listings (use site:ebay.com "sold" or filter=completed)
- Search Sotheby's and Christie's auction records if applicable
- Look for sales within the last 24 months.

STEP 2 — If fewer than 3 sold listings are found, supplement with ACTIVE FOR-SALE listings:
- Search eBay active listings
- Search Invaluable.com
- Search Etsy if applicable
- Active listings represent asking price, note this when calculating.

PRICING LOGIC:
- If you have 3+ sold listings: base the suggested_price on the median/average of those sold prices.
- If fewer than 3 sold listings: use sold prices where available, then discount active for-sale prices by 10-20%.
- Condition and provenance significantly affect value — factor these in.

After researching, respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "suggested_price": <number, single best estimate>,
  "price_low": <number, low end of range>,
  "price_high": <number, high end of range>,
  "comparable_sales": [
    {
      "source": "eBay" or "Heritage Auctions" or "Sotheby's" or "Christie's" or "Invaluable",
      "listing_type": "sold" or "for_sale",
      "title": "<listing title>",
      "price": <number>,
      "date": "<approximate date, e.g. Feb 2025>",
      "url": "<url if available, otherwise omit>",
      "condition": "<condition if listed>"
    }
  ],
  "analysis": "<1-2 sentences explaining the valuation, mentioning auction records, how condition and provenance were factored in>"
}

Include 3-5 comparable listings total.`;
}

// ── Insurance norms prompt (CUR-4) ───────────────────────────────────────────
//
// Items of Distinction span the widest range. Fine art insurance typically
// agrees a value at appraised retail (auction estimate × commission + tax),
// which often runs significantly above resale. Jewelry carriers (Jewelers
// Mutual, Chubb) typically agree values 1.2-1.5× retail.

export function iodInsuranceNormsPrompt(categories: string[]): string {
  const categoriesJSON = JSON.stringify(categories);
  return `You are an insurance valuation expert specializing in fine art, jewelry, memorabilia, and collectible insurance. For each category below, research the typical multiplier that an insurance scheduled value bears relative to the current open-market resale price.

Categories to research (use the exact slug strings in your response): ${categoriesJSON}

Context for each category:
- "fine-art": paintings, sculpture, prints, works on paper. Carriers typically agree at appraised retail (auction estimate + buyer's premium + tax + acquisition friction). Multipliers often 1.2-1.8×.
- "memorabilia": sports, music, historical artifacts. Authentication adds premium; rarity drives spread. Multipliers ~1.1-1.5×.
- "collectibles": coins, stamps, comics, toys, etc. PCGS/CGC/PSA grading sets a retail baseline. Multipliers ~1.1-1.4×.
- "jewelry": precious metals + stones. Retail replacement on jewelry typically runs 1.5-2.5× resale because resale is fire-sale (gold weight + stone wholesale) while replacement is retail. Multipliers often 1.5-2.0×.
- "other": miscellaneous. Use a conservative middle-range multiplier ~1.2.

For each category, derive a single multiplier (decimal, typically 1.0-2.0).

Considerations:
- Jewelry has the largest spread (replacement at retail vs. resale at melt + wholesale).
- Fine art carriers (AXA Art, Chubb, Berkley Asset Protection, Distinguished) use appraisal-based agreed values.
- Use web_search to find recent (last 2 years) carrier or appraiser guidance.

Respond with ONLY valid JSON:
{
  "norms": [
    {
      "category": "<one of the categories above, verbatim>",
      "multiplier": <decimal, typically 1.0-2.0>,
      "notes": "<1-2 sentences citing the source or industry practice>"
    }
  ]
}

Include one entry per category. Omit any you cannot justify.`;
}
