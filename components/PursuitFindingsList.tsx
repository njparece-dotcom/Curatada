"use client";

import { useState } from "react";
import { useHideValues } from "@/lib/HideValuesContext";

export interface PursuitFinding {
  id: string;
  pursuit_id: string;
  source: string;
  title: string | null;
  url: string;
  price: number | null;
  condition: string | null;
  location: string | null;
  days_listed: number | null;
  listed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

const SOURCE_COLORS: Record<string, string> = {
  reverb:        "bg-orange-900/40 text-orange-300",
  ebay:          "bg-blue-900/40 text-blue-300",
  guitar_center: "bg-red-900/40 text-red-300",
  sweetwater:    "bg-green-900/40 text-green-300",
  chrono24:      "bg-indigo-900/40 text-indigo-300",
  watchbox:      "bg-purple-900/40 text-purple-300",
  bobs_watches:  "bg-yellow-900/40 text-yellow-300",
  jomashop:      "bg-sky-900/40 text-sky-300",
  facebook:      "bg-blue-900/40 text-blue-400",
  craigslist:    "bg-violet-900/40 text-violet-300",
  google:        "bg-teal-900/40 text-teal-300",
};

const defaultColor = "bg-surface-3 text-text-dim";

function sourceBadge(source: string) {
  return SOURCE_COLORS[source] ?? defaultColor;
}

function fmtRaw(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(v);
}

function age(f: PursuitFinding): string {
  if (f.days_listed != null) {
    if (f.days_listed === 0) return "Today";
    if (f.days_listed === 1) return "1 day ago";
    if (f.days_listed < 7)   return `${f.days_listed} days ago`;
    if (f.days_listed < 30)  return `${Math.round(f.days_listed / 7)}w ago`;
    return `${Math.round(f.days_listed / 30)}mo ago`;
  }
  // Fall back to first_seen_at
  const days = Math.floor((Date.now() - new Date(f.first_seen_at).getTime()) / 86400000);
  if (days === 0) return "Found today";
  if (days === 1) return "Found 1d ago";
  return `Found ${days}d ago`;
}

interface Props {
  findings: PursuitFinding[];
  onSearch?: () => void;
  searching?: boolean;
  onClear?: () => void;
  clearing?: boolean;
}

export default function PursuitFindingsList({ findings, onSearch, searching, onClear, clearing }: Props) {
  const { hideValues } = useHideValues();
  const fmt = (v: number) => hideValues ? "$•••" : fmtRaw(v);
  const [expanded, setExpanded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const count = findings.length;
  const preview = findings.slice(0, 3);

  if (count === 0 && !onSearch) return null;

  return (
    <div className="border-t border-border/60 pt-3 mt-1">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
          className="flex items-center gap-2 text-xs text-text-dim hover:text-text transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span>
            {count === 0
              ? "No listings yet"
              : `${count} listing${count !== 1 ? "s" : ""} found`}
          </span>
          {count > 0 && (
            <span className="bg-accent/20 text-accent text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </button>

        <div className="flex items-center gap-3">
          {onSearch && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSearch(); }}
              disabled={searching}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-dim hover:text-accent transition-colors disabled:opacity-40"
              title="Search now"
            >
              {searching ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity={0.3} />
                  <path strokeLinecap="round" d="M21 12a9 9 0 00-9-9" />
                </svg>
              ) : (
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 0z" />
                </svg>
              )}
              <span>{searching ? "Searching…" : "Search now"}</span>
            </button>
          )}

          {onClear && count > 0 && (
            confirmClear ? (
              <span className="flex items-center gap-1.5 text-[10px]">
                <span className="text-text-dim">Clear all?</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmClear(false);
                    onClear();
                  }}
                  disabled={clearing}
                  className="text-red-400 hover:text-red-300 uppercase tracking-wider font-medium disabled:opacity-40 transition-colors"
                >
                  {clearing ? "Clearing…" : "Yes"}
                </button>
                <span className="text-border">·</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmClear(false); }}
                  className="text-text-dim hover:text-text uppercase tracking-wider transition-colors"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmClear(true); }}
                disabled={clearing}
                className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-dim hover:text-red-400 transition-colors disabled:opacity-40"
                title="Clear all listings"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Clear</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Listings */}
      {count > 0 && (
        <div className="space-y-1.5">
          {(expanded ? findings : preview).map(f => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-start gap-2 group/row rounded px-2 py-1.5 hover:bg-surface-3 transition-colors -mx-2"
            >
              {/* Source chip */}
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${sourceBadge(f.source)}`}>
                {f.source.replace(/_/g, " ")}
              </span>

              {/* Title */}
              <span className="flex-1 min-w-0 text-xs text-text-dim group-hover/row:text-text transition-colors line-clamp-1">
                {f.title ?? f.url}
              </span>

              {/* Right side: price + age + arrow */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {f.price != null && (
                  <span className="text-xs font-mono text-accent font-bold">
                    {fmt(f.price)}
                  </span>
                )}
                <span className="text-[10px] text-text-dim whitespace-nowrap">{age(f)}</span>
                <svg className="w-3 h-3 text-text-dim opacity-0 group-hover/row:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </div>
            </a>
          ))}

          {!expanded && count > 3 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="text-[10px] text-text-dim hover:text-accent transition-colors pl-2"
            >
              + {count - 3} more listing{count - 3 !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
