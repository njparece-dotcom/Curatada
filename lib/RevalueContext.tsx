"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import type { InsuranceValueSource } from "@/lib/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Minimum gap between API calls to stay under 30k tokens/min rate limit.
// Conservative — applies whether the item needs a fresh AI valuation
// (~20k tokens) or just an insurance-value compute (norm research is
// cheaper but still uses Anthropic).
const INTER_ITEM_DELAY_MS = 8000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface CollectionItem {
  id: string;
  year?: number | null;
  brand: string;
  model: string;
  latest_ai_price?: number | null;
  latest_ai_price_date?: string | null;
  // CUR-1 insurance fields. The runner reads these to decide whether to
  // call /value (fresh AI sale-price valuation; expensive) or
  // /insurance-value (compute from the latest existing AI valuation; cheap).
  insure?: boolean | null;
  insurance_value?: number | null;
  insurance_value_source?: InsuranceValueSource | null;
}

/** True if the item has no AI valuation, or it's older than 7 days. */
export function needsAiRevalue(item: CollectionItem): boolean {
  if (!item.latest_ai_price_date) return true;
  return Date.now() - new Date(item.latest_ai_price_date).getTime() >= SEVEN_DAYS_MS;
}

/**
 * True if the item is flagged for insurance but has no insurance value yet,
 * AND the user hasn't manually set an override (which the runner should
 * never overwrite). Such items are cheaply backfilled via the
 * /insurance-value endpoint without burning Anthropic tokens on a fresh
 * AI sale-price valuation.
 */
export function needsInsuranceCompute(item: CollectionItem): boolean {
  if (!item.insure) return false;
  if (item.insurance_value != null) return false;
  if (item.insurance_value_source === "user_override") return false;
  return true;
}

/**
 * Union of "needs attention" reasons — used by the category page's count
 * badge and the runner's queue filter. An item appears here if it needs a
 * fresh AI valuation OR is flagged for insurance but has no value.
 */
export function needsRevalue(item: CollectionItem): boolean {
  return needsAiRevalue(item) || needsInsuranceCompute(item);
}

/** Patch shape the runner sends to the caller per successful item. */
export interface ItemPatch {
  latest_ai_price?: number;
  latest_ai_price_date?: string;
  insurance_value?: number;
  insurance_value_source?: InsuranceValueSource;
  insurance_value_date?: string;
}

export interface RevalueResult {
  id: string;
  name: string;
  // For an AI-revalue: the new suggested_price. For an insurance-only
  // compute: the new insurance_value. Either way, something to display.
  price?: number;
  // What action was taken — for status-banner phrasing.
  kind?: "ai_revalue" | "insurance_only";
  error?: string;
  skipped?: boolean;
  rateLimited?: boolean;
}

export interface RevalueState {
  isRunning: boolean;
  category: string;
  total: number;
  done: number;
  current: string;
  results: RevalueResult[];
  isDismissed: boolean;
}

interface RevalueContextValue {
  state: RevalueState | null;
  startRevalue: (
    items: CollectionItem[],
    category: string,
    onItemPatched: (id: string, patch: ItemPatch) => void,
    apiBase?: string,
  ) => void;
  dismiss: () => void;
}

const RevalueContext = createContext<RevalueContextValue>({
  state: null,
  startRevalue: () => {},
  dismiss: () => {},
});

export function RevalueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RevalueState | null>(null);
  const abortRef = useRef(false);

  const startRevalue = useCallback(
    async (
      items: CollectionItem[],
      category: string,
      onItemPatched: (id: string, patch: ItemPatch) => void,
      apiBase?: string,
    ) => {
      // Pre-filter to only items that actually need valuation. needsRevalue
      // is the union of needsAiRevalue (no/stale AI value) and
      // needsInsuranceCompute (insured but no value yet).
      const queue = items.filter(needsRevalue);
      if (!queue.length) return;

      abortRef.current = false;

      setState({
        isRunning: true,
        category,
        total: queue.length,
        done: 0,
        current: "",
        results: [],
        isDismissed: false,
      });

      const results: RevalueResult[] = [];
      let apiCallCount = 0;
      const base = apiBase ?? "/api/guitars";

      for (let i = 0; i < queue.length; i++) {
        if (abortRef.current) break;
        const item = queue[i];
        const name = [item.year, item.brand, item.model].filter(Boolean).join(" ");

        // Space out API calls to avoid rate limiting. We apply the same
        // delay whether the item is going through /value or /insurance-value
        // — both can ultimately hit Anthropic (the latter via on-demand
        // norm research), and the 8s gap is the rate-limit-safe baseline.
        if (apiCallCount > 0) {
          setState((prev) =>
            prev ? { ...prev, current: `Waiting to avoid rate limit…` } : prev,
          );
          await sleep(INTER_ITEM_DELAY_MS);
        }

        if (abortRef.current) break;

        // Per-item action: AI revalue takes priority over insurance-only
        // (since a fresh AI valuation will auto-compute insurance as a
        // side-effect via CUR-5).
        const action: "ai_revalue" | "insurance_only" = needsAiRevalue(item)
          ? "ai_revalue"
          : "insurance_only";

        const labelPrefix = action === "ai_revalue" ? "" : "Insurance only: ";

        setState((prev) =>
          prev ? { ...prev, done: i, current: `${labelPrefix}${name}` } : prev,
        );

        try {
          const endpoint =
            action === "ai_revalue"
              ? `${base}/${item.id}/value`
              : `${base}/${item.id}/insurance-value`;

          const res = await fetch(endpoint, { method: "POST" });
          apiCallCount++;

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const isRateLimited = res.status === 429 || err.code === "rate_limited";
            results.push({
              id: item.id,
              name,
              kind: action,
              error: err.error || "Failed",
              rateLimited: isRateLimited,
            });
          } else {
            const data = await res.json();

            if (action === "ai_revalue") {
              const nowIso = new Date().toISOString();
              const patch: ItemPatch = {
                latest_ai_price: data.suggested_price,
                latest_ai_price_date: nowIso,
              };
              // CUR-5 auto-trigger: the /value response now includes
              // insurance fields when the item was flagged. Forward those
              // to the caller so the UI doesn't need a second round-trip.
              if (data.insurance_value != null) {
                patch.insurance_value = data.insurance_value;
                patch.insurance_value_source = data.insurance_value_source;
                patch.insurance_value_date = data.insurance_value_date;
              }
              results.push({
                id: item.id,
                name,
                kind: action,
                price: data.suggested_price,
              });
              onItemPatched(item.id, patch);
            } else {
              // Insurance-only path: response is { insurance_value,
              // insurance_value_source, insurance_value_date }.
              const patch: ItemPatch = {
                insurance_value: data.insurance_value,
                insurance_value_source: data.insurance_value_source,
                insurance_value_date: data.insurance_value_date,
              };
              results.push({
                id: item.id,
                name,
                kind: action,
                price: data.insurance_value,
              });
              onItemPatched(item.id, patch);
            }
          }
        } catch (err) {
          apiCallCount++;
          results.push({ id: item.id, name, kind: action, error: String(err) });
        }

        setState((prev) =>
          prev ? { ...prev, done: i + 1, results: [...results] } : prev,
        );
      }

      setState((prev) =>
        prev
          ? { ...prev, isRunning: false, done: queue.length, current: "", results }
          : prev,
      );
    },
    [],
  );

  const dismiss = useCallback(() => {
    abortRef.current = true;
    setState((prev) => (prev ? { ...prev, isDismissed: true } : null));
  }, []);

  return (
    <RevalueContext.Provider value={{ state, startRevalue, dismiss }}>
      {children}
    </RevalueContext.Provider>
  );
}

export function useRevalue() {
  return useContext(RevalueContext);
}
