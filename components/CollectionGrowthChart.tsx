"use client";

import { useEffect, useRef, useState } from "react";
import { useUserModules, ModuleKey } from "@/lib/UserModulesContext";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChartPoint {
  date: string;
  // Per-module item counts at this snapshot — added in
  // app/api/dashboard/history/route.ts. The legacy value/cost fields are
  // still returned but unused here; the chart is now an item-count view.
  guitar_count: number;
  watch_count: number;
  auto_count: number;
  iod_count: number;
}

const PERIODS = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "6M", value: "6M" },
  { label: "1Y", value: "1Y" },
  { label: "All", value: "ALL" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCount(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── SVG constants ─────────────────────────────────────────────────────────

const W   = 800;
const H   = 240;
const PAD = { top: 16, right: 24, bottom: 36, left: 56 };
const CW  = W - PAD.left - PAD.right;
const CH  = H - PAD.top  - PAD.bottom;

const LINE_TOTAL  = "#e9c176";   // gold         — total count
const LINE_GUITAR = "#d4956a";   // amber        — guitars
const LINE_WATCH  = "#5eafd8";   // steel blue   — watches
const LINE_AUTO   = "#4ade80";   // green        — automobiles
const LINE_IOD    = "#a78bfa";   // purple       — items of distinction

interface Series {
  key: "guitar_count" | "watch_count" | "auto_count" | "iod_count";
  color: string;
  gradId: string;
  label: string;
  tooltipLabel: string;
  module: ModuleKey;
}

// All collection series — filtered by enabled modules at render time
const ALL_SERIES: Series[] = [
  { key: "guitar_count", color: LINE_GUITAR, gradId: "grad-guitar", label: "Guitars",      tooltipLabel: "Guitars",     module: "guitars"      },
  { key: "watch_count",  color: LINE_WATCH,  gradId: "grad-watch",  label: "Watches",      tooltipLabel: "Watches",     module: "watches"      },
  { key: "auto_count",   color: LINE_AUTO,   gradId: "grad-auto",   label: "Automobiles",  tooltipLabel: "Autos",       module: "automobiles"  },
  { key: "iod_count",    color: LINE_IOD,    gradId: "grad-iod",    label: "Collectibles", tooltipLabel: "Collectibles",module: "collectibles" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function CollectionGrowthChart() {
  const { isEnabled } = useUserModules();

  const [period, setPeriod]       = useState("AUTO");
  const [activePeriod, setActive] = useState<string | null>(null);
  const [points, setPoints]       = useState<ChartPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [hoverIdx, setHoverIdx]   = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Only show series whose module is enabled
  const activeSeries = ALL_SERIES.filter(s => isEnabled(s.module));

  const filteredTotal = (p: ChartPoint) =>
    activeSeries.reduce((sum, s) => sum + p[s.key], 0);

  useEffect(() => {
    setLoading(true);
    setHoverIdx(null);
    fetch(`/api/dashboard/history?period=${period}`)
      .then(r => r.json())
      .then(d => {
        setPoints(d.points ?? []);
        if (d.period) setActive(d.period);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  function handlePeriodClick(value: string) {
    setPeriod(value);
    setActive(value);
  }

  // ── Scales ──────────────────────────────────────────────────────────────

  const maxVal = Math.max(1, ...points.map(filteredTotal));
  // Use ceiling at a nice integer step (1, 2, 5, 10, ...) so the Y axis
  // shows whole-number ticks instead of "0.4 items".
  const niceMax = (() => {
    if (maxVal <= 5)  return Math.max(5, Math.ceil(maxVal));
    if (maxVal <= 10) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
    return Math.ceil(maxVal / mag) * mag;
  })();

  const xOf = (i: number) =>
    PAD.left + (i / Math.max(1, points.length - 1)) * CW;
  const yOf = (v: number) =>
    PAD.top + CH - (v / niceMax) * CH;

  function linePts(key: Series["key"]) {
    return points.map((p, i) => `${xOf(i)},${yOf(p[key])}`).join(" ");
  }

  function areaPath(key: Series["key"]) {
    if (points.length < 2) return "";
    const pts = points.map((p, i) =>
      `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(p[key])}`
    ).join(" ");
    const bl = `L${xOf(points.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`;
    return pts + " " + bl;
  }

  // ── Axis labels ──────────────────────────────────────────────────────

  // Pick an integer tick count that divides niceMax cleanly. For small
  // collections (niceMax = 5) one tick per item; for bigger ones, 5 ticks.
  const Y_TICKS = niceMax <= 5 ? niceMax : 5;
  const yLabels = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
    const v = (niceMax / Y_TICKS) * i;
    return { v, y: yOf(v) };
  });

  const xLabelIdxs = (() => {
    if (points.length === 0) return [] as number[];
    const count = Math.min(6, points.length);
    return Array.from({ length: count }, (_, i) =>
      Math.round((i / (count - 1)) * (points.length - 1))
    );
  })();

  // ── Hover ─────────────────────────────────────────────────────────────

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX  = ((e.clientX - rect.left) / rect.width) * W;
    const relX  = svgX - PAD.left;
    const idx   = Math.round((relX / CW) * (points.length - 1));
    setHoverIdx(Math.max(0, Math.min(points.length - 1, idx)));
  }

  function tooltipX(i: number) {
    const x = xOf(i);
    return x > W / 2 ? x - 188 : x + 14;
  }

  // Tooltip row positions — date row + total row + one per active series.
  const tooltipHeight = 60 + activeSeries.length * 17;

  // ── Render ─────────────────────────────────────────────────────────────

  const totalsAllZero = points.length === 0 || points.every(p => filteredTotal(p) === 0);

  return (
    <div className="lg:col-span-8 bg-surface-2 rounded-lg p-8 flex flex-col min-h-[340px]">

      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h4 className="font-headline text-2xl text-text">Collection Growth</h4>
          <p className="text-text-dim text-xs uppercase tracking-widest mt-1">
            Items tracked by category over time
          </p>
        </div>

        {/* Period tabs */}
        <div className="flex gap-0.5 bg-surface-3 rounded-md p-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => handlePeriodClick(p.value)}
              className={`px-3 py-1.5 text-[11px] font-label uppercase tracking-widest rounded transition-all duration-150 ${
                activePeriod === p.value
                  ? "bg-accent text-on-primary shadow-sm"
                  : "text-text-dim hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend — Total + per-module lines */}
      <div className="flex flex-wrap gap-5 mb-5">
        <div className="flex items-center gap-2">
          <svg width="20" height="8" className="flex-shrink-0">
            <line x1="0" y1="4" x2="20" y2="4" stroke={LINE_TOTAL} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-xs text-text-dim font-label">Total</span>
        </div>

        {activeSeries.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <svg width="20" height="8" className="flex-shrink-0">
              <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" />
            </svg>
            <span className="text-xs text-text-dim font-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Chart area */}
      {loading ? (
        <div className="flex-1 bg-surface-3 rounded animate-pulse" />
      ) : totalsAllZero ? (
        <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
          No items yet — add an item to see your collection grow over time.
        </div>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full flex-1 overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
          style={{ cursor: "crosshair" }}
        >
          <defs>
            <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={LINE_TOTAL}  stopOpacity="0.14" />
              <stop offset="100%" stopColor={LINE_TOTAL}  stopOpacity="0.01" />
            </linearGradient>
            {ALL_SERIES.map(s => (
              <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={s.color} stopOpacity="0.12" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
              </linearGradient>
            ))}
          </defs>

          {/* Y grid + labels */}
          {yLabels.map(({ v, y }, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="rgba(255,255,255,0.05)" strokeWidth={1}
              />
              <text
                x={PAD.left - 8} y={y + 4}
                textAnchor="end"
                fill="#777"
                style={{ fontSize: 10, fontFamily: "monospace" }}
              >
                {fmtCount(v)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {xLabelIdxs.map(i => (
            <text
              key={i}
              x={xOf(i)} y={H - 4}
              textAnchor="middle"
              fill="#666"
              style={{ fontSize: 10 }}
            >
              {fmtDate(points[i].date)}
            </text>
          ))}

          {/* Area fill for total — computed from active series */}
          <path
            d={(() => {
              if (points.length < 2) return "";
              const pts = points.map((p, i) =>
                `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(filteredTotal(p))}`
              ).join(" ");
              return pts + ` L${xOf(points.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`;
            })()}
            fill="url(#grad-total)"
          />

          {/* Per-module area fills */}
          {activeSeries.map(s => (
            <path key={s.key} d={areaPath(s.key)} fill={`url(#${s.gradId})`} />
          ))}

          {/* Lines — per-module first, total on top */}
          {activeSeries.map(s => (
            <polyline
              key={s.key}
              points={linePts(s.key)}
              fill="none" stroke={s.color} strokeWidth={1.5}
              strokeLinejoin="round" strokeLinecap="round"
            />
          ))}
          <polyline
            points={points.map((p, i) => `${xOf(i)},${yOf(filteredTotal(p))}`).join(" ")}
            fill="none" stroke={LINE_TOTAL} strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round"
          />

          {/* Hover crosshair */}
          {hoverIdx !== null && (() => {
            const pt = points[hoverIdx];
            const tx = tooltipX(hoverIdx);
            const ty = PAD.top;
            const ptTotal = filteredTotal(pt);

            return (
              <g>
                {/* Vertical guide */}
                <line
                  x1={xOf(hoverIdx)} y1={PAD.top}
                  x2={xOf(hoverIdx)} y2={H - PAD.bottom}
                  stroke="rgba(255,255,255,0.12)" strokeWidth={1}
                  strokeDasharray="3 3"
                />

                {/* Dots — only for active series */}
                {activeSeries.map(s => (
                  <circle key={s.key} cx={xOf(hoverIdx)} cy={yOf(pt[s.key])} r={3} fill={s.color} stroke="#1a1a1a" strokeWidth={1.5} />
                ))}
                <circle cx={xOf(hoverIdx)} cy={yOf(ptTotal)} r={5} fill={LINE_TOTAL} stroke="#1a1a1a" strokeWidth={1.5} />

                {/* Tooltip box */}
                <rect
                  x={tx} y={ty}
                  width={184} height={tooltipHeight}
                  rx={5}
                  fill="rgba(22,22,22,0.94)"
                  stroke="rgba(255,255,255,0.08)" strokeWidth={0.75}
                />

                {/* Date */}
                <text x={tx + 10} y={ty + 15} fill="#777"
                  style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.08em" }}>
                  {fmtDateFull(pt.date).toUpperCase()}
                </text>

                {/* Total */}
                <circle cx={tx + 14} cy={ty + 31} r={4} fill={LINE_TOTAL} />
                <text x={tx + 24} y={ty + 35} fill={LINE_TOTAL}
                  style={{ fontSize: 11, fontFamily: "monospace", fontWeight: "bold" }}>
                  {fmtCount(ptTotal)} item{ptTotal === 1 ? "" : "s"}
                </text>

                {/* Active collection rows */}
                {activeSeries.map((s, idx) => {
                  const cy = ty + 50 + idx * 17;
                  const textY = ty + 54 + idx * 17;
                  return (
                    <g key={s.key}>
                      <circle cx={tx + 14} cy={cy} r={3} fill={s.color} />
                      <text x={tx + 24} y={textY} fill="#ccc"
                        style={{ fontSize: 10, fontFamily: "monospace" }}>
                        {s.tooltipLabel} {fmtCount(pt[s.key])}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}
