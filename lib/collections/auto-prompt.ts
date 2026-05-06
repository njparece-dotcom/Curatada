import type { AutoItem } from "@/lib/types";

export function autoValuationPrompt(item: AutoItem): string {
  const descriptor = [item.year, item.brand, item.model, item.trim_level]
    .filter(Boolean)
    .join(" ");

  const mileageStr = item.mileage != null
    ? `${Number(item.mileage).toLocaleString()} miles`
    : "unknown mileage";
  const conditionStr = item.condition ?? "unknown condition";
  const bodyStr = item.body_style ?? "";
  const engineStr = item.engine ?? "";

  return `You are an automotive valuation expert. Research the current market value for: ${descriptor} with ${mileageStr} in ${conditionStr} condition.${bodyStr ? ` Body style: ${bodyStr}.` : ""}${engineStr ? ` Engine: ${engineStr}.` : ""}

STEP 1 — Search for SOLD/COMPLETED listings first:
- Search KBB (kbb.com) for current trade-in and private party values
- Search CarGurus sold/completed listings (use site:cargurus.com)
- Search AutoTrader completed listings (use site:autotrader.com)
- Look for comparable sales within the last 6 months.

STEP 2 — If fewer than 3 sold listings are found, supplement with ACTIVE FOR-SALE listings:
- Search AutoTrader active listings
- Search Cars.com active listings
- Active listings represent asking price (typically higher), note this when calculating.

PRICING LOGIC:
- If you have 3+ sold listings: base the suggested_price on the median/average of those sold prices.
- If fewer than 3 sold listings: use sold prices where available, then discount active for-sale prices by 10-15%.
- Always adjust for condition: "${conditionStr}" relative to the listings found.
- Mileage is a key factor — adjust accordingly vs comparable listings.

After researching, respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "suggested_price": <number, single best estimate>,
  "price_low": <number, low end of range>,
  "price_high": <number, high end of range>,
  "comparable_sales": [
    {
      "source": "KBB" or "CarGurus" or "AutoTrader" or "Cars.com",
      "listing_type": "sold" or "for_sale",
      "title": "<listing title>",
      "price": <number>,
      "date": "<approximate date, e.g. Feb 2025>",
      "url": "<url if available, otherwise omit>",
      "condition": "<condition if listed>"
    }
  ],
  "analysis": "<1-2 sentences explaining the valuation, specifically mentioning KBB, CarGurus, AutoTrader as comp sources, how mileage and condition were factored in>"
}

Include 3-5 comparable listings total.`;
}
