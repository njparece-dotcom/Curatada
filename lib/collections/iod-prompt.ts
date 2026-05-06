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
