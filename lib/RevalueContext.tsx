"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Minimum gap between API calls to stay under 30k tokens/min rate limit
const INTER_ITEM_DELAY_MS = 8000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Returns true if the item has no AI valuation or it's older than 7 days. */
export function needsRevalue(item: CollectionItem): boolean {
  if (!item.latest_ai_price_date) return true;
  return Date.now() - new Date(item.latest_ai_price_date).getTime() >= SEVEN_DAYS_MS;
}

export interface CollectionItem {
  id: string;
  year?: number | null;
  brand: string;
  model: string;
  latest_ai_price?: number | null;
  latest_ai_price_date?: string | null;
}

export interface RevalueResult {
  id: string;
  name: string;
  price?: number;
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
  startRevalue: (items: CollectionItem[], category: string, onItemValued: (id: string, price: number) => void, apiBase?: string) => void;
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
      onItemValued: (id: string, price: number) => void,
      apiBase?: string
    ) => {
      // Pre-filter to only items that actually need valuation
      const queue = items.filter(needsRevalue);
      if (!queue.length) return;

      abortRef.current = false;

      setState({
        isRunning: true,
        category,
        total: queue.length,   // only items that will actually be valued
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

        // Space out API calls to avoid rate limiting
        if (apiCallCount > 0) {
          setState((prev) =>
            prev ? { ...prev, current: `Waiting to avoid rate limit…` } : prev
          );
          await sleep(INTER_ITEM_DELAY_MS);
        }

        if (abortRef.current) break;

        setState((prev) =>
          prev ? { ...prev, done: i, current: name } : prev
        );

        try {
          const res = await fetch(`${base}/${item.id}/value`, { method: "POST" });
          apiCallCount++;
          if (!res.ok) {
            const err = await res.json();
            const isRateLimited = res.status === 429 || err.code === "rate_limited";
            results.push({ id: item.id, name, error: err.error || "Failed", rateLimited: isRateLimited });
          } else {
            const data = await res.json();
            results.push({ id: item.id, name, price: data.suggested_price });
            onItemValued(item.id, data.suggested_price);
          }
        } catch (err) {
          apiCallCount++;
          results.push({ id: item.id, name, error: String(err) });
        }

        setState((prev) =>
          prev ? { ...prev, done: i + 1, results: [...results] } : prev
        );
      }

      setState((prev) =>
        prev
          ? { ...prev, isRunning: false, done: queue.length, current: "", results }
          : prev
      );
    },
    []
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
