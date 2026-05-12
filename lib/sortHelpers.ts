// Shared comparators for table-header sorting on the four category pages.
//
// The category pages already have a small sort state (sortBy + sortDir) and a
// useMemo'd sortedItems comparator. This helper covers the common cases —
// nulls go to the end, dates parse cleanly, strings locale-compare, booleans
// and the Condition enum get their natural order — so per-page code stays
// short.

import type { Condition } from "@/lib/types";

/**
 * Generic comparator that handles null / number / date-string / string /
 * boolean. Returns a number suitable for Array.sort (negative if a < b,
 * positive if a > b, 0 if equal). Null/undefined/empty always sort AFTER
 * defined values on ascending order; the page-level direction flip handles
 * descending.
 */
export function compareValues(a: unknown, b: unknown): number {
  const aMissing = a == null || a === "";
  const bMissing = b == null || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;

  if (typeof a === "boolean" && typeof b === "boolean") {
    return (a ? 1 : 0) - (b ? 1 : 0);
  }

  if (typeof a === "string" && typeof b === "string") {
    // Numeric strings come first — NUMERIC columns from pg arrive as strings
    // ("1050.00", "300.00"). Without this guard, locale-compare would sort
    // them lexicographically ("$1,050" before "$300" because "1" < "3").
    // Trim guards a corner case: Number("") is 0, which would falsely sort
    // empty strings as numerically equivalent to "0". The leading
    // null/empty check up top already filters those, but being explicit
    // here is defensive against future callers.
    const aTrim = a.trim();
    const bTrim = b.trim();
    if (aTrim !== "" && bTrim !== "") {
      const aNum = Number(aTrim);
      const bNum = Number(bTrim);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    }

    // Date strings: a YYYY-MM-DD prefix is a strong signal this is a
    // timestamp, parse and compare chronologically.
    if (/^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) {
      const aDate = Date.parse(a);
      const bDate = Date.parse(b);
      if (!isNaN(aDate) && !isNaN(bDate)) return aDate - bDate;
    }

    return a.localeCompare(b);
  }

  // Last-resort numeric coercion for any other shape (e.g. one side is a
  // number-string and the other is a boolean).
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;

  return 0;
}

// Condition ordinal — Mint is best (highest), Poor is worst. Used by the
// per-page comparator so sorting Condition ascending puts the worst first
// (which is the intuitive direction for "show me what needs attention").
const CONDITION_ORDER: Record<Condition, number> = {
  Mint: 6,
  Excellent: 5,
  "Very Good": 4,
  Good: 3,
  Fair: 2,
  Poor: 1,
};

export function conditionOrdinal(c: string | null | undefined): number {
  if (!c) return 0;
  return CONDITION_ORDER[c as Condition] ?? 0;
}

/**
 * "Best available price" — the cascade the existing "Value" toolbar button
 * uses (latest AI → latest user → purchase). Exposed so per-page sortedItems
 * can keep using this when sortBy === "value".
 */
export function bestPriceOf(item: {
  latest_ai_price?: number | null;
  latest_user_price?: number | null;
  purchase_price?: number | null;
}): number {
  return Number(item.latest_ai_price ?? item.latest_user_price ?? item.purchase_price ?? 0);
}

/**
 * Compare by Brand with Year as a secondary tiebreak. Used by every page's
 * sortBy === "brand" branch so within-brand ordering is chronological rather
 * than insertion-order-dependent. Year tiebreak is ascending regardless of
 * the page-level sortDir — the direction flip happens at the top level via
 * `sortDir === "asc" ? cmp : -cmp`. Equal-brand items will reverse correctly
 * with the rest of the list when the user clicks Brand a second time.
 */
export function compareBrandThenYear(
  a: { brand?: string | null; year?: number | null },
  b: { brand?: string | null; year?: number | null },
): number {
  const brandCmp = compareValues(a.brand, b.brand);
  if (brandCmp !== 0) return brandCmp;
  return compareValues(a.year, b.year);
}
