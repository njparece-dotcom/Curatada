"use client";

import { useHideValues } from "@/lib/HideValuesContext";
import type { InsuranceFields, InsuranceValueSource } from "@/lib/types";

interface InsuranceValueRowProps {
  item: InsuranceFields;
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
 * flagged but no insurance_value yet, renders a placeholder "Not yet computed"
 * — which becomes a real value once CUR-4 + CUR-5 ship and the user runs a
 * fresh valuation on the item.
 *
 * Respects the global `useHideValues()` toggle: masks the dollar value to
 * `$•••` when hide-values is on (matches the rest of the detail modals).
 */
export default function InsuranceValueRow({ item }: InsuranceValueRowProps) {
  const { hideValues } = useHideValues();

  if (!item.insure) return null;

  const source = item.insurance_value_source ?? null;
  const dateStr = formatInsuranceDate(item.insurance_value_date);
  const hasValue = item.insurance_value != null;

  return (
    <div className="bg-surface-2 rounded-xl p-4 border border-border mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
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
            Not yet computed — run an AI valuation to populate this.
          </p>
        )}
      </div>
    </div>
  );
}
