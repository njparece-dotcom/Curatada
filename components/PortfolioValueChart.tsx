"use client";

import { useEffect, useRef, useState } from "react";
import { useUserModules, ModuleKey } from "@/lib/UserModulesContext";

// ── Types ───────────────────────────────────────────────────────────────────

interface ChartPoint {
  date: string;
  guitar: number;
  watch: number;
  auto: number;
  iod: number;
  total: number;
  cost: number;
  guitar_cost: number;
  watch_cost: number;
  auto_cost: number;
  iod_cost: number;
}

const PERIODS = [
  { label: "1M", value: "1M" },
  { label: "3M", value: "3M" },
  { label: "6M", value: "6M" },
  { label: "1Y", value: "1Y" },
  { label: "All", value: "ALL" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtShort(v: number): string {
  if (v === 0) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
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
const PAD = { top: 16, right: 24, bottom: 36, left: 68 };
const CW  = W - PAD.left - PAD.right;
const CH  = H - PAD.top  - PAD.bottom;

const LINE_TOTAL  = "#e9c176";   // gold         — total value
const LINE_GUITAR = "#d4956a";   // amber        — guitars
const LINE_WATCH  = "#5eafd8";   // steel blue   — watches
const LINE_AUTO   = "#4ade80";   // green        — automobiles
const LINE_IOD    = "#a78bfa";   // purple       — items of distinction
const LINE_COST   = "#6b7280";   // slate gray   — cost basis (dashed)

// All collection series — filtered by enabled modules at render time
const ALL_SERIES = [
  { key: "guitar" as const, color: LINE_GUITAR, gradId: "grad-guitar", label: "Guitars",      tooltipLabel: "Guitars",     module: "guitars"      as ModuleKey },
  { key: "watch"  as const, color: LINE_WATCH,  gradId: "grad-watch",  label: "Watches",      tooltipLabel: "Watches",     module: "watches"      as ModuleKey },
  { key: "auto"   as const, color: LINE_AUTO,   gradId: "grad-auto",   label: "Automobiles",  tooltipLabel: "Autos",       module: "automobiles"  as ModuleKey },
  { key: "iod"    as const, color: LINE_IOD,    gradId: "grad-iod",    label: "Collectibles", tooltipLabel: "Collectibles",module: "collectibles" as ModuleKey },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function PortfolioValueChart() {
  const { isEnabled } = useUserModules();

  const [period, setPeriod]       = useState("AUTO");
  const [activePeriod, setActive] = useState<string | null>(null);
  const [points, setPoints]       = useState<ChartPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const [hoverIdx, setHoverIdx]   = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Only show series whose module is enabled
  const activeSeries = ALL_SERIES.filter(s => isEnabled(s.module));

  // Recompute "total" and "cost" per point from only active collections
  const filteredTotal = (p: ChartPoint) =>
    activeSeries.reduce((sum, s) => sum + p[s.key], 0);

  const COST_KEY_MAP: Record<string, keyof ChartPoint> = {
    guitar:       "guitar_cost",
    watch:        "watch_cost",
    auto:         "auto_cost",
    iod:          "iod_cost",
  };
  const filteredCost = (p: ChartPoint) =>
    activeSeries.reduce((sum, s) => sum + (p[COST_KEY_MAP[s.key]] as number), 0);

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

  const maxVal = Math.max(1, ...points.map(p => Math.max(filteredTotal(p), filteredCost(p))));
  const niceMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(maxVal)));
    return Math.ceil(maxVal / mag) * mag;
  })();

  const xOf = (i: number) =>
    PAD.left + (i / Math.max(1, points.length - 1)) * CW;
  const yOf = (v: number) =>
    PAD.top + CH - (v / niceMax) * CH;

  // ── SVG path builders ─────────────────────────────────────────────────

  function linePts(key: keyof ChartPoint) {
    return points.map((p, i) => `${xOf(i)},${yOf(Number(p[key]))}`).join(" ");
  }

  function areaPath(key: keyof ChartPoint) {
    if (points.length < 2) return "";
    const pts = points.map((p, i) =>
      `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(Number(p[key]))}`
    ).join(" ");
    const bl = `L${xOf(points.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`;
    return pts + " " + bl;
  }

  // ── Axis labels ──────────────────────────────────────────────────────

  const Y_TICKS = 5;
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

  // Tooltip row positions — dynamic based on how many series are active
  // date: 15, total circle: 31/text:35, series start at circle:50/text:54, each 17px, cost after
  const tooltipHeight = 80 + activeSeries.length * 17;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="lg:col-span-8 bg-surface-2 rounded-lg p-8 flex flex-col min-h-[340px]">

      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h4 className="font-headline text-2xl text-text">Portfolio Value</h4>
          <p className="text-text-dim text-xs uppercase tracking-widest mt-1">
            Estimated value over time
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

      {/* Legend — always show Total + Cost, then only enabled collection lines */}
      <div className="flex flex-wrap gap-5 mb-5">
        {/* Total — always shown */}
        <div className="flex items-center gap-2">
          <svg width="20" height="8" className="flex-shrink-0">
            <line x1="0" y1="4" x2="20" y2="4" stroke={LINE_TOTAL} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-xs text-text-dim font-label">Total</span>
        </div>

        {/* Per-module lines */}
        {activeSeries.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <svg width="20" height="8" className="flex-shrink-0">
              <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" />
            </svg>
            <span className="text-xs text-text-dim font-label">{s.label}</span>
          </div>
        ))}

        {/* Cost basis — always shown */}
        <div className="flex items-center gap-2">
          <svg width="20" height="8" className="flex-shrink-0">
            <line x1="0" y1="4" x2="20" y2="4" stroke={LINE_COST} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="4 3" />
          </svg>
          <span className="text-xs text-text-dim font-label">Cost Basis</span>
        </div>
      </div>

      {/* Chart area */}
      {loading ? (
        <div className="flex-1 bg-surface-3 rounded animate-pulse" />
      ) : points.length === 0 || points.every(p => filteredTotal(p) === 0 && filteredCost(p) === 0) ? (
        <div className="flex-1 flex items-center justify-center text-text-dim text-sm">
          No valuation data yet — add valuations to see your portfolio over time.
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
                {fmtShort(v)}
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

          {/* Area fills — only for enabled collections */}
          {activeSeries.map(s => (
            <path key={s.key} d={areaPath(s.key)} fill={`url(#${s.gradId})`} />
          ))}

          {/* Lines — cost at back, then active collections, total at front */}
          <polyline
            points={points.map((p, i) => `${xOf(i)},${yOf(filteredCost(p))}`).join(" ")}
            fill="none" stroke={LINE_COST} strokeWidth={1.5}
            strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray="5 4"
          />
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
            const ptCost  = filteredCost(pt);
            const gain = ptTotal - ptCost;
            const gainPct = ptCost > 0
              ? ((gain / ptCost) * 100).toFixed(1)
              : null;

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
                <circle cx={xOf(hoverIdx)} cy={yOf(ptCost)}  r={3} fill={LINE_COST}  stroke="#1a1a1a" strokeWidth={1.5} />
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
                  {fmtShort(ptTotal)}
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
                        {s.tooltipLabel} {fmtShort(pt[s.key])}
                      </text>
                    </g>
                  );
                })}

                {/* Cost basis */}
                {(() => {
                  const costCy = ty + 50 + activeSeries.length * 17;
                  const costTextY = ty + 54 + activeSeries.length * 17;
                  return (
                    <g>
                      <circle cx={tx + 14} cy={costCy} r={3} fill={LINE_COST} />
                      <text x={tx + 24} y={costTextY} fill="#999"
                        style={{ fontSize: 10, fontFamily: "monospace" }}>
                        Cost {fmtShort(ptCost)}
                      </text>
                      {gainPct !== null && (
                        <text x={tx + 24 + 74} y={costTextY}
                          fill={gain >= 0 ? "#4ade80" : "#f87171"}
                          style={{ fontSize: 9, fontFamily: "monospace" }}>
                          {gain >= 0 ? "+" : ""}{gainPct}%
                        </text>
                      )}
                    </g>
                  );
                })()}
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}
