"use client";

import { useState } from "react";
import { useHideValues } from "@/lib/HideValuesContext";
import type { InsuranceFields, InsuranceValueSource } from "@/lib/types";

type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";

interface InsuranceValueRowProps {
  item: InsuranceFields & { id: string };
  // Required for the "Compute Insurance Value" button. When omitted, the
  // button is hidden — useful for read-only contexts (e.g. the Paperwork
  // schedule view, where compute is triggered elsewhere).
  module?: ModuleSlug;
  // Called after a successful compute so the parent can patch its state
  // without a full refetch.
  onComputed?: (fields: {
    insurance_value: number;
    insurance_value_source: InsuranceValueSource;
    insurance_value_date: string;
  }) => void;
}

const SOURCE_LABELS: Record<InsuranceValueSource, string> = {
  ai: "AI",
  alternate_from_user: "Alternate",
  user_override: "User-set",
};

const SOURCE_BADGE_COLORS: Record<InsuranceValueSource, string> = {
  ai: "bg-accent/10 text-accent border-accent/30",
  alternate_from_user: "bg-amber-900/30 text-amber-300 border-amber-700/40",
  user_override: "bg-sky-900/30 text-sky-300 border-sky-700/40",
};

const API_PATH: Record<ModuleSlug, (id: string) => string> = {
  guitars: (id) => `/api/guitars/${id}/insurance-value`,
  watches: (id) => `/api/watches/${id}/insurance-value`,
  automobiles: (id) => `/api/automobiles/${id}/insurance-value`,
  iod: (id) => `/api/iod/${id}/insurance-value`,
};

function formatInsuranceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Insurance status row for an item's detail modal. Renders nothing when the
 * item is not flagged for insurance (`insure` is false / undefined). When
 * flagged but no insurance_value yet, renders a placeholder + a "Compute
 * Insurance Value" button that hits the new endpoint (which reuses the
 * latest existing AI valuation — no fresh Anthropic call needed).
 *
 * Respects the global `useHideValues()` toggle: masks the dollar value to
 * `$•••` when hide-values is on (matches the rest of the detail modals).
 */
export default function InsuranceValueRow({ item, module, onComputed }: InsuranceValueRowProps) {
  const { hideValues } = useHideValues();
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!item.insure) return null;

  const source = item.insurance_value_source ?? null;
  const dateStr = formatInsuranceDate(item.insurance_value_date);
  const hasValue = item.insurance_value != null;

  async function handleCompute() {
    if (!module) return;
    setComputing(true);
    setError(null);
    try {
      const res = await fetch(API_PATH[module](item.id), { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to compute insurance value" }));
        throw new Error(err.error || "Failed to compute insurance value");
      }
      const data: {
        insurance_value: number;
        insurance_value_source: InsuranceValueSource;
        insurance_value_date: string;
      } = await res.json();
      onComputed?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute insurance value");
    } finally {
      setComputing(false);
    }
  }

  return (
    <div className="bg-surface-2 rounded-xl p-4 border border-border mt-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
            />
          </svg>
          <span className="text-xs text-text-muted font-medium">Insurance Value</span>
        </div>
        {/* Recompute / compute button — only when wired with a module. */}
        {module && !computing && (
          <button
            onClick={handleCompute}
            disabled={computing}
            className="flex items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50 disabled:cursor-wait"
            title={hasValue ? "Recompute from the latest AI valuation + current category multiplier" : "Compute from the latest AI valuation + category multiplier (no fresh AI call)"}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0013.62 4.371M19.5 12a7.5 7.5 0 00-13.62-4.371M19.5 7.5v4.5h-4.5M4.5 16.5v-4.5h4.5" />
            </svg>
            {hasValue ? "Recompute" : "Compute now"}
          </button>
        )}
        {module && computing && (
          <span className="flex items-center gap-1 text-[11px] text-text-dim">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Computing…
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        {hasValue ? (
          <>
            <p className="text-xl font-bold text-text font-mono">
              {hideValues ? "$•••" : formatPrice(item.insurance_value)}
            </p>
            <div className="flex items-center gap-2">
              {source && (
                <span
                  className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${SOURCE_BADGE_COLORS[source]}`}
                  title={
                    source === "ai"
                      ? "Computed from AI sale-price valuation × per-category insurance multiplier"
                      : source === "alternate_from_user"
                      ? "Computed from your purchase price × per-category multiplier (lower confidence — run an AI valuation for a better number)"
                      : "Manually entered by you (overrides auto-computed value)"
                  }
                >
                  {SOURCE_LABELS[source]}
                </span>
              )}
              {dateStr && <span className="text-[10px] text-text-dim">{dateStr}</span>}
            </div>
          </>
        ) : (
          <p className="text-sm text-text-dim">
            Not yet computed — click <strong>Compute now</strong> to derive from the latest AI valuation, or run a fresh AI valuation.
          </p>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}
