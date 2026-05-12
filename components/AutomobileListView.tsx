"use client";

import { AutoItem, CONDITION_COLORS } from "@/lib/types";
import { useHideValues } from "@/lib/HideValuesContext";
import SelectionCheckbox from "@/components/SelectionCheckbox";

interface AutomobileListViewProps {
  items: AutoItem[];
  onItemClick: (item: AutoItem) => void;
  onDelete: (id: string) => void;
  // Bulk-select props (optional — checkbox column hides when omitted).
  selectedIds?: Set<string>;
  onSelectChange?: (id: string, selected: boolean) => void;
  onSelectAllToggle?: () => void;
}

const fmtRaw = (price: number | null | undefined) => {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(price));
};

const fmtMileage = (m: number | null | undefined) => {
  if (m == null) return "—";
  return Number(m).toLocaleString("en-US") + " mi";
};

const COLUMNS = [
  "Year",
  "Brand",
  "Model",
  "Trim",
  "Body Style",
  "Color",
  "Mileage",
  "Condition",
  "Buy Cost",
  "AI Est.",
  "My Value",
  "Insured",
  "Insured Value",
];

export default function AutomobileListView({
  items,
  onItemClick,
  selectedIds,
  onSelectChange,
  onSelectAllToggle,
}: AutomobileListViewProps) {
  const { hideValues } = useHideValues();
  const fmt = (price: number | null | undefined) => hideValues ? "$•••" : fmtRaw(price);

  const selectionEnabled = !!selectedIds && !!onSelectChange && !!onSelectAllToggle;
  const selectedCount = selectedIds?.size ?? 0;
  const headerState: boolean | "indeterminate" =
    selectedCount === 0 ? false : selectedCount === items.length ? true : "indeterminate";

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm border-collapse min-w-[1000px]">
        <thead>
          <tr className="bg-surface-2 border-b border-border">
            {selectionEnabled && (
              <th className="px-4 py-3 w-10">
                <SelectionCheckbox state={headerState} onChange={onSelectAllToggle!} header />
              </th>
            )}
            {COLUMNS.map((col) => (
              <th
                key={col}
                className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const isSelected = selectedIds?.has(item.id) ?? false;
            return (
              <tr
                key={item.id}
                onClick={() => onItemClick(item)}
                className={`group cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors ${
                  isSelected ? "bg-accent/5" : idx % 2 === 0 ? "bg-surface" : "bg-surface/60"
                }`}
              >
                {selectionEnabled && (
                  <td className="px-4 py-3 w-10">
                    <SelectionCheckbox
                      state={isSelected}
                      onChange={() => onSelectChange!(item.id, !isSelected)}
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.year ?? "—"}</td>
                <td className="px-4 py-3 text-text font-medium whitespace-nowrap">{item.brand}</td>
                <td className="px-4 py-3 text-text whitespace-nowrap">{item.model}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.trim_level || "—"}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.body_style || "—"}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap">{item.color || "—"}</td>
                <td className="px-4 py-3 text-text-muted whitespace-nowrap font-mono">{fmtMileage(item.mileage)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.condition ? (
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${CONDITION_COLORS[item.condition]}`}
                    >
                      {item.condition}
                    </span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text font-mono whitespace-nowrap">{fmt(item.purchase_price)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.latest_ai_price != null ? (
                    <span className="text-accent font-mono font-medium">{fmt(item.latest_ai_price)}</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.latest_user_price != null ? (
                    <span className="text-text font-mono font-medium">{fmt(item.latest_user_price)}</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                {/* Insured */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {item.insure ? (
                    <span className="text-accent text-xs font-medium">Yes</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
                {/* Insured Value */}
                <td className="px-4 py-3 whitespace-nowrap font-mono">
                  {item.insurance_value != null ? (
                    <span className="text-text font-medium">{fmt(item.insurance_value)}</span>
                  ) : (
                    <span className="text-text-dim">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
