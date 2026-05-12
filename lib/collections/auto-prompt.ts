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

// ── Insurance norms prompt (CUR-4) ───────────────────────────────────────────
//
// Automobile insurance is highly model-dependent. Modern household vehicles
// are typically insured under ACV (actual cash value) policies with
// multipliers near 1.0. Classic/collector cars are usually "agreed value"
// policies with multipliers that can run substantially above current sale
// price (1.2-1.8× is common per Hagerty / Chubb / Grundy guidance).

export function autoInsuranceNormsPrompt(categories: string[]): string {
  const categoriesJSON = JSON.stringify(categories);
  return `You are an insurance valuation expert specializing in collector and household automobiles. For each category below, research the typical multiplier that an insurance scheduled value bears relative to the current open-market resale price.

Categories to research (use the exact slug strings in your response): ${categoriesJSON}

Context for each category:
- "collection": collector cars, classic cars, sports cars insured under agreed-value policies (Hagerty, Chubb, Grundy, American Modern). Multipliers typically 1.2-1.8× to reflect restoration cost, originality premium, and replacement scarcity.
- "household": daily drivers under standard ACV policies. Multipliers near 1.0 — insurance pays current market value at loss.

For each category, derive a single multiplier (decimal). For "household", expect ~1.0. For "collection", expect 1.2-1.8 depending on segment but provide a category-wide average.

Considerations:
- Agreed-value collector policies (Hagerty etc.) explicitly schedule a value that may exceed Bring-a-Trailer / classic.com prices to reflect restoration and originality premiums.
- Standard auto insurance pays ACV — the multiplier is effectively 1.0 (just current resale).
- Use web_search to find recent (last 2 years) carrier guidance.

Respond with ONLY valid JSON:
{
  "norms": [
    {
      "category": "<one of the categories above, verbatim>",
      "multiplier": <decimal>,
      "notes": "<1-2 sentences citing the source or industry practice>"
    }
  ]
}

Include one entry per category. Omit any you cannot justify.`;
}
