"use client";

// Admin → Moderation review queue (client view).
//
// The "tabs" scaffold (defaultTab="nsfw") is laid out so a future "Public
// Gallery" review queue drops in next to "NSFW Review" without restructuring
// — the second tab will hit a different status filter set
// (e.g. unreviewed + flagged restricted to images with public_visibility=true)
// once the public gallery feature exists.
//
// Page state:
//   - selected tab (only "nsfw" for now)
//   - status chip filter (multi-select, default flagged + unreviewed)
//   - score threshold slider (0..1, default 0.5 — matches NSFW_FLAG_THRESHOLD)
//   - rows + paging (offset-based; "Load more" appends until has_more=false)
//
// All filter changes refetch from page 0. Mutations (approve/block) optimistically
// remove the row from the visible list — the row no longer matches the active
// filter, so it'd disappear on next refetch anyway.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ModuleSlug = "guitars" | "watches" | "automobiles" | "iod";
type ModerationStatus = "unreviewed" | "clean" | "flagged" | "approved" | "blocked";

interface NsfwCategory {
  className: string;
  probability: number;
}

interface QueueItem {
  module: ModuleSlug;
  image_id: string;
  item_id: string;
  filename: string;
  path: string;
  mime_type: string | null;
  is_primary: boolean;
  moderation_status: ModerationStatus;
  nsfw_score: number | null;
  nsfw_categories: NsfwCategory[] | null;
  created_at: string;
  item_label: string | null;
  user_id: string;
}

interface QueueResponse {
  items: QueueItem[];
  paging: { limit: number; offset: number; has_more: boolean };
  filters: { statuses: ModerationStatus[]; min_score: number };
}

const MODULE_LABEL: Record<ModuleSlug, string> = {
  guitars: "Guitars",
  watches: "Watches",
  automobiles: "Automobiles",
  iod: "Collectibles",
};

const MODULE_LINK: Record<ModuleSlug, string> = {
  guitars: "/guitars",
  watches: "/watches",
  automobiles: "/automobiles",
  iod: "/collectibles",
};

const STATUS_OPTIONS: { value: ModerationStatus; label: string; hint: string }[] = [
  { value: "flagged", label: "Flagged", hint: "NSFW.js score ≥ 0.5" },
  { value: "unreviewed", label: "Unreviewed", hint: "no Tier-1 verdict yet" },
  { value: "clean", label: "Clean", hint: "score < 0.5" },
  { value: "approved", label: "Approved", hint: "manually cleared" },
  { value: "blocked", label: "Blocked", hint: "manually withheld" },
];

const PAGE_SIZE = 30;

// ── Tab scaffold ────────────────────────────────────────────────────────────
//
// Single source of truth for available review surfaces. Adding a "Public
// Gallery" tab later is a matter of (a) adding an entry here, (b) wiring its
// API endpoint (likely a new query param on the existing queue route), and
// (c) updating the conditional render to dispatch on `activeTab`.

const TABS = [
  { id: "nsfw" as const, label: "NSFW Review" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function ModerationQueueView() {
  const [activeTab, setActiveTab] = useState<TabId>("nsfw");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ModerationStatus>>(
    () => new Set<ModerationStatus>(["flagged", "unreviewed"]),
  );
  const [minScore, setMinScore] = useState<number>(0.5);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [acting, setActing] = useState<Set<string>>(new Set());

  const statusesParam = useMemo(
    () => Array.from(selectedStatuses).join(","),
    [selectedStatuses],
  );

  const fetchPage = useCallback(
    async (pageOffset: number, append: boolean) => {
      if (selectedStatuses.size === 0) {
        setItems([]);
        setHasMore(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          statuses: statusesParam,
          min_score: String(minScore),
          limit: String(PAGE_SIZE),
          offset: String(pageOffset),
        });
        const res = await fetch(`/api/admin/moderation/queue?${params.toString()}`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as QueueResponse;
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
        setOffset(pageOffset + data.items.length);
        setHasMore(data.paging.has_more);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load queue";
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [statusesParam, minScore, selectedStatuses.size],
  );

  // Refetch from page 0 whenever filters change.
  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  function toggleStatus(s: ModerationStatus) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  async function decide(item: QueueItem, decision: "approve" | "block") {
    setActing((prev) => {
      const next = new Set(prev);
      next.add(item.image_id);
      return next;
    });
    try {
      const res = await fetch("/api/admin/moderation/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: item.module,
          image_id: item.image_id,
          decision,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      // Optimistic remove — the new status no longer matches the filter, so
      // the row would disappear on the next refresh anyway. Keeping it on the
      // page would just confuse the reviewer ("did my click register?").
      setItems((prev) => prev.filter((i) => i.image_id !== item.image_id));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Action failed";
      setError(message);
    } finally {
      setActing((prev) => {
        const next = new Set(prev);
        next.delete(item.image_id);
        return next;
      });
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="font-headline text-3xl font-bold text-text tracking-tight">
          Moderation Queue
        </h1>
        <p className="text-sm text-text-dim mt-1 max-w-2xl">
          Tier-1 NSFW.js classifier flags every image at upload. Review flagged
          and unreviewed rows here; approve to clear, block to withhold from
          public surfaces. Hard-blocked images (score ≥ 0.95) are refused at
          upload and never appear in this queue.
        </p>
      </header>

      {/* Tab strip — single tab today, scaffolded for the public-gallery review
          surface that will drop in next to it. */}
      <div className="flex items-center gap-1 border-b border-border mb-5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-accent border-b-2 border-accent -mb-px"
                : "text-text-dim hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-3 text-xs text-text-muted italic">
          Public Gallery review · coming with public galleries
        </span>
      </div>

      {/* Filter bar — status chips on the left, score slider on the right. */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const on = selectedStatuses.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatus(opt.value)}
                title={opt.hint}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  on
                    ? "bg-accent text-[#0c0e10] border-accent"
                    : "bg-surface-2 text-text-dim border-border hover:text-text"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 min-w-[260px]">
          <label className="text-xs font-medium text-text-dim whitespace-nowrap">
            Min score
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={minScore}
            onChange={(e) => setMinScore(parseFloat(e.target.value))}
            className="flex-1 accent-accent"
            aria-label="Minimum NSFW score"
          />
          <span className="text-xs font-mono text-text tabular-nums w-12 text-right">
            {minScore.toFixed(2)}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 text-red-200 rounded-lg px-4 py-3 mb-5 text-sm">
          {error}
        </div>
      )}

      {/* Grid of cards. Each card is independent — its action buttons modify
          only that row. */}
      {loading ? (
        <p className="text-text-dim text-sm">Loading queue…</p>
      ) : items.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-10 text-center">
          <p className="text-text-dim text-sm">
            No images match the current filters. Drop the score threshold or
            include more statuses to widen the queue.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <ModerationCard
              key={`${item.module}:${item.image_id}`}
              item={item}
              busy={acting.has(item.image_id)}
              onDecide={(decision) => decide(item, decision)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => fetchPage(offset, true)}
            disabled={loadingMore}
            className="px-5 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 border border-border text-sm text-text disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ModerationCard ─────────────────────────────────────────────────────────

function ModerationCard({
  item,
  busy,
  onDecide,
}: {
  item: QueueItem;
  busy: boolean;
  onDecide: (decision: "approve" | "block") => void;
}) {
  const score = item.nsfw_score;
  const scoreLabel = score == null ? "—" : score.toFixed(3);
  const scoreColor =
    score == null
      ? "bg-surface-3 text-text-dim"
      : score >= 0.85
      ? "bg-red-900/40 text-red-200 border-red-700/40"
      : score >= 0.5
      ? "bg-amber-900/40 text-amber-200 border-amber-700/40"
      : "bg-emerald-900/30 text-emerald-200 border-emerald-700/40";

  const statusColor: Record<ModerationStatus, string> = {
    unreviewed: "bg-surface-3 text-text-dim border-border",
    clean: "bg-emerald-900/30 text-emerald-200 border-emerald-700/40",
    flagged: "bg-amber-900/40 text-amber-200 border-amber-700/40",
    approved: "bg-blue-900/30 text-blue-200 border-blue-700/40",
    blocked: "bg-red-900/40 text-red-200 border-red-700/40",
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Image preview. The path is `/uploads/<filename>` which the
          /api/uploads/[...path] route resolves: 302 to a presigned R2 URL in
          prod, or streams from disk in dev. */}
      <div className="relative aspect-square bg-surface-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.path}
          alt={item.item_label || item.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${statusColor[item.moderation_status]}`}
          >
            {item.moderation_status}
          </span>
          {item.is_primary && (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-surface/80 text-text-dim border border-border">
              primary
            </span>
          )}
        </div>
        <div
          className={`absolute top-2 right-2 px-2 py-0.5 rounded font-mono text-xs border ${scoreColor}`}
          title="NSFW score (max across Porn/Sexy/Hentai)"
        >
          {scoreLabel}
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={MODULE_LINK[item.module]}
            className="text-sm font-medium text-text truncate hover:text-accent"
            title={item.item_label || "Untitled"}
          >
            {item.item_label || "Untitled"}
          </Link>
          <span className="text-[10px] text-text-muted uppercase tracking-wide flex-shrink-0">
            {MODULE_LABEL[item.module]}
          </span>
        </div>

        {item.nsfw_categories && item.nsfw_categories.length > 0 && (
          <div className="grid grid-cols-5 gap-1">
            {item.nsfw_categories.map((c) => (
              <CategoryBar key={c.className} cat={c} />
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-2">
          <button
            type="button"
            onClick={() => onDecide("approve")}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-700/40 text-sm text-emerald-100 transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onDecide("block")}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 border border-red-700/40 text-sm text-red-100 transition-colors disabled:opacity-50"
          >
            Block
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryBar({ cat }: { cat: NsfwCategory }) {
  const pct = Math.round(cat.probability * 100);
  // Highlight the three "real NSFW" classes — visually steers the eye to
  // what the score is actually weighing.
  const isNsfw = ["Porn", "Sexy", "Hentai"].includes(cat.className);
  const barColor = isNsfw ? "bg-amber-500/80" : "bg-text-dim/50";
  return (
    <div className="flex flex-col gap-0.5" title={`${cat.className}: ${pct}%`}>
      <div className="h-1 bg-surface-3 rounded overflow-hidden">
        <div className={`${barColor} h-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-text-muted uppercase tracking-wider truncate">
        {cat.className.slice(0, 4)}
      </span>
    </div>
  );
}
