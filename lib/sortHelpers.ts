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
    // Detect ISO-ish date strings cheaply: a 'T' or trailing 'Z' is a strong
    // hint that this is a timestamp. Otherwise locale-compare as plain text.
    if (/^\d{4}-\d{2}-\d{2}/.test(a) && /^\d{4}-\d{2}-\d{2}/.test(b)) {
      const aDate = Date.parse(a);
      const bDate = Date.parse(b);
      if (!isNaN(aDate) && !isNaN(bDate)) return aDate - bDate;
    }
    return a.localeCompare(b);
  }

  // Numeric strings (NUMERIC from pg can arrive as a string) — coerce.
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
