"use client";

import React from "react";

interface SelectionCheckboxProps {
  // Three-state visual: false = empty, true = checked, "indeterminate" =
  // dash (some-but-not-all selected; used by the list-view header checkbox).
  state: boolean | "indeterminate";
  onChange: () => void;
  // When true, the checkbox is the always-visible header variant. When false
  // (the default), the row variant fades in on hover unless already selected
  // — mirrors the GuitarCard pattern.
  header?: boolean;
  title?: string;
  ariaLabel?: string;
}

/**
 * Shared selection checkbox used by the list-view tables. Styled to match
 * the bulk-select checkbox on the GuitarCard/WatchCard/AutomobileCard/IoDCard
 * components so the two view modes feel like one feature.
 */
export default function SelectionCheckbox({
  state,
  onChange,
  header = false,
  title,
  ariaLabel,
}: SelectionCheckboxProps) {
  const checked = state === true;
  const indeterminate = state === "indeterminate";
  const filled = checked || indeterminate;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked ? "true" : "false"}
      aria-label={ariaLabel ?? (header ? "Select all" : "Select item")}
      title={title}
      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
        filled
          ? "bg-accent border-accent text-white"
          : "bg-surface-3 border-border text-transparent hover:text-text-muted hover:border-border-2"
      } ${header ? "" : "group-hover:opacity-100 " + (checked ? "opacity-100" : "opacity-70")}`}
    >
      {indeterminate ? (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}
