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
