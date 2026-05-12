"use client";

import React from "react";

interface SortableHeaderProps {
  label: string;
  // The field key this column sorts by. When omitted the th renders as a
  // non-clickable label (used for placeholder columns like "Open to Sell").
  field?: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onToggle: (field: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

/**
 * Clickable table-header cell with a sort-direction indicator.
 *
 * Click semantics (matches the existing toolbar button in the four
 * category pages):
 *   - Click an inactive column → set sort to that column, default direction.
 *   - Click the active column → flip direction.
 *
 * Render contract: when `field` is omitted the cell is non-clickable and
 * shows just the label (used for placeholder / "Open to Sell" columns).
 */
export default function SortableHeader({
  label,
  field,
  currentSort,
  currentDir,
  onToggle,
  align = "left",
  className = "",
}: SortableHeaderProps) {
  const baseClass = `text-${align} text-xs font-semibold text-text-muted uppercase tracking-wider px-4 py-3 whitespace-nowrap ${className}`;

  if (!field) {
    return <th className={baseClass}>{label}</th>;
  }

  const isActive = currentSort === field;

  return (
    <th
      onClick={() => onToggle(field)}
      className={`${baseClass} cursor-pointer select-none transition-colors ${
        isActive ? "text-accent" : "hover:text-text"
      }`}
      role="button"
      aria-sort={isActive ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {isActive && (
          <svg
            className={`w-3 h-3 transition-transform ${currentDir === "asc" ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </span>
    </th>
  );
}
