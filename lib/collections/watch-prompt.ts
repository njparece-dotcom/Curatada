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
