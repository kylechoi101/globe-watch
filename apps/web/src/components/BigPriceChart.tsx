import { useMemo, useRef, useState } from "react";
import type {
  DriftPoint,
  AssetUniverseEntry,
  MarketStatus,
} from "@globe-watch/shared";
import { useStore, type DriftSample } from "../state/store";
import { ProxyTooltip } from "./ProxyTooltip";

const PALETTE: Record<string, string> = {
  // Gold venues
  "GLD": "#facc15",
  "IAU": "#fbbf24",
  "CGL.TO": "#fb923c",
  "SGLN.L": "#22d3ee",
  "PHAU.L": "#0ea5e9",
  "4GLD.DE": "#a78bfa",
  "1326.T": "#f472b6",
  "2840.HK": "#34d399",
  "GOLD.AX": "#84cc16",
  // BTC venues
  "BTC-USD": "#facc15",
  "BTC-EUR": "#a78bfa",
  "BTC-GBP": "#22d3ee",
  "BTC-JPY": "#f472b6",
  "BTC-AUD": "#84cc16",
  "BTC-CAD": "#fb923c",
  "BTC-KRW": "#ec4899",
  "BTC-CNY": "#ef4444",
  "BTC-INR": "#f97316",
  "BTC-RUB": "#0ea5e9",
};

interface Props {
  asset: AssetUniverseEntry;
  points: DriftPoint[];
  statuses: Record<string, MarketStatus>;
}

interface HoverState {
  ts: number;
  x: number;
}

interface Line {
  symbol: string;
  city: string;
  color: string;
  emphasis: boolean;
  latest: number;
  samples: { ts: number; v: number }[];
}

export function BigPriceChart(props: Props) {
  const history = useStore((s) => s.history);
  const hoveredSymbol = useStore((s) => s.hoveredSymbol);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);
  const divisor = props.asset.display_divisor ?? 1;
  const unit = props.asset.display_unit ?? "USD";

  const [hover, setHover] = useState<HoverState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const lines: Line[] = useMemo(
    () =>
      props.points.map((p) => ({
        symbol: p.symbol,
        city: p.proxy.city,
        color: PALETTE[p.symbol] ?? "#e5e7eb",
        emphasis: p.is_reference,
        latest: Number.isFinite(p.implied_usd)
          ? p.implied_usd / divisor
          : NaN,
        samples: (history[p.symbol] ?? []).map((s) => ({
          ts: s.ts,
          v: Number.isFinite(s.implied_usd) ? s.implied_usd / divisor : NaN,
        })),
      })),
    [props.points, history, divisor],
  );

  const validLatest = lines
    .map((l) => l.latest)
    .filter((v) => Number.isFinite(v));
  const median =
    validLatest.length === 0
      ? NaN
      : validLatest.slice().sort((a, b) => a - b)[
          Math.floor(validLatest.length / 2)
        ];
  const spread =
    validLatest.length === 0
      ? NaN
      : Math.max(...validLatest) - Math.min(...validLatest);
  const spreadBps =
    Number.isFinite(spread) && Number.isFinite(median) && median !== 0
      ? (spread / median) * 10_000
      : NaN;

  // Chart bounds.
  const all = lines.flatMap((l) => l.samples).filter((s) => Number.isFinite(s.v));
  let yMin = Infinity, yMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const s of all) {
    if (s.v < yMin) yMin = s.v;
    if (s.v > yMax) yMax = s.v;
    if (s.ts < tMin) tMin = s.ts;
    if (s.ts > tMax) tMax = s.ts;
  }
  const hasData = all.length > 0;
  if (!hasData) {
    yMin = Number.isFinite(median) ? median * 0.999 : 0;
    yMax = Number.isFinite(median) ? median * 1.001 : 1;
    tMin = Date.now() / 1000 - 60;
    tMax = Date.now() / 1000;
  } else {
    const pad = Math.max((yMax - yMin) * 0.2, yMax * 0.0005);
    yMin -= pad;
    yMax += pad;
  }

  const W = 460, H = 320;
  const padL = 56, padR = 14, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xScale = (ts: number) =>
    padL + (innerW * (ts - tMin)) / Math.max(1, tMax - tMin);
  const yScale = (v: number) =>
    padT + innerH * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));

  const yTicks = niceTicks(yMin, yMax, 5);

  const allTimestamps = useMemo(() => {
    const s = new Set<number>();
    for (const l of lines) for (const p of l.samples) if (Number.isFinite(p.v)) s.add(p.ts);
    return Array.from(s).sort((a, b) => a - b);
  }, [lines]);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hasData || !svgRef.current || allTimestamps.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const px = (e.clientX - rect.left) * scaleX;
    if (px < padL || px > W - padR) {
      setHover(null);
      return;
    }
    const tsCursor = tMin + ((px - padL) * (tMax - tMin)) / Math.max(1, innerW);
    const idx = nearestIndex(allTimestamps, tsCursor);
    const ts = allTimestamps[idx];
    setHover({ ts, x: xScale(ts) });
  }

  function onMouseLeave() {
    setHover(null);
  }

  const hoverValues = useMemo(() => {
    if (!hover) return null;
    return lines.map((l) => {
      const s = l.samples.find((p) => p.ts === hover.ts);
      return { line: l, v: s && Number.isFinite(s.v) ? s.v : NaN };
    });
  }, [hover, lines]);

  const focusSymbol = hoveredSymbol ?? selected;
  const hasFocus = focusSymbol !== null;

  const selectedPoint = selected
    ? props.points.find((p) => p.symbol === selected) ?? null
    : null;
  const selectedStatus = selectedPoint
    ? props.statuses[selectedPoint.proxy.exchange_mic]
    : undefined;

  // "Δ since open": diff vs oldest sample of the focused line if any,
  // otherwise vs the median line's oldest sample. Falls back gracefully
  // when the seed hasn't loaded yet.
  const movement = useMemo(() => {
    const ref = focusSymbol
      ? lines.find((l) => l.symbol === focusSymbol)
      : lines.find((l) => l.emphasis) ?? lines[0];
    if (!ref) return null;
    const valid = ref.samples.filter((s) => Number.isFinite(s.v));
    if (valid.length < 2) return null;
    const first = valid[0].v;
    const last = valid[valid.length - 1].v;
    const abs = last - first;
    const pct = first !== 0 ? (abs / first) * 100 : 0;
    return { abs, pct, fromTs: valid[0].ts, label: ref.symbol };
  }, [lines, focusSymbol]);

  return (
    <div className="absolute top-16 right-4 bottom-4 w-[488px] glass rounded-lg flex-col pointer-events-auto overflow-hidden hidden md:flex">
      <header className="px-3.5 pt-2.5 pb-2.5 border-b border-zinc-800/60">
        <div className="flex items-baseline justify-between mb-0.5">
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-mono">
            {props.asset.display_name} · {unit}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-mono">
            {lines.length} venues · spread{" "}
            <span className="text-zinc-300">
              {Number.isFinite(spreadBps) ? `${fmtNum(spreadBps, 0)} bps` : "—"}
            </span>
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="font-mono text-[34px] font-semibold text-zinc-50 tabular-nums leading-none tracking-tight">
            {Number.isFinite(median) ? fmtNum(median, 2) : "—"}
            <span className="text-[13px] text-zinc-500 ml-1.5 font-normal align-baseline">
              median
            </span>
          </div>
          {movement && (
            <div
              className={`text-right font-mono leading-tight ${
                movement.abs >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              <div className="text-[15px] tabular-nums">
                {movement.abs >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(movement.pct), 2)}%
              </div>
              <div className="text-[9px] text-zinc-500 uppercase tracking-wider">
                since {fmtTime(movement.fromTs)} · {movement.label}
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="relative flex-shrink-0">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          className="block mx-auto"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          <defs>
            <linearGradient id="chartFade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(24,24,27,0)" />
              <stop offset="100%" stopColor="rgba(24,24,27,0.4)" />
            </linearGradient>
          </defs>

          <rect
            x={padL}
            y={padT}
            width={innerW}
            height={innerH}
            fill="url(#chartFade)"
            pointerEvents="none"
          />

          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="rgba(255,255,255,0.045)"
              />
              <text
                x={padL - 6}
                y={yScale(t) + 3}
                textAnchor="end"
                fill="rgba(255,255,255,0.4)"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {fmtNum(t, 2)}
              </text>
            </g>
          ))}

          {hasData &&
            lines.map((l) => {
              const pts = l.samples
                .filter((s) => Number.isFinite(s.v))
                .map((s) => `${xScale(s.ts).toFixed(1)},${yScale(s.v).toFixed(1)}`)
                .join(" ");
              if (!pts) return null;
              const isFocused = focusSymbol === l.symbol;
              const isDimmed = hasFocus && !isFocused;
              const baseWidth = l.emphasis ? 2 : 1.4;
              const stroke = isFocused ? baseWidth + 1.2 : baseWidth;
              const opacity = isDimmed
                ? 0.14
                : isFocused
                  ? 1
                  : l.emphasis
                    ? 0.95
                    : 0.7;
              return (
                <g key={l.symbol}>
                  {/* Invisible thicker path for click/hover pickup */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredSymbol(l.symbol)}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    onClick={() => setSelected(l.symbol)}
                  />
                  {/* Glow under the focused line so it really pops */}
                  {isFocused && (
                    <polyline
                      points={pts}
                      fill="none"
                      stroke={l.color}
                      strokeWidth={stroke + 4}
                      strokeOpacity={0.2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  )}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={stroke}
                    strokeOpacity={opacity}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                </g>
              );
            })}

          {!hasData && (
            <text
              x={W / 2}
              y={H / 2}
              textAnchor="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize={11}
              fontFamily="ui-monospace, monospace"
            >
              collecting samples…
            </text>
          )}

          {hover && hoverValues && (
            <g pointerEvents="none">
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padT}
                y2={H - padB}
                stroke="rgba(255,255,255,0.42)"
                strokeWidth={1}
              />
              {hoverValues.map(
                (h) =>
                  Number.isFinite(h.v) && (
                    <g key={h.line.symbol}>
                      {/* Outer halo for the focused row */}
                      {focusSymbol === h.line.symbol && (
                        <circle
                          cx={hover.x}
                          cy={yScale(h.v)}
                          r={7}
                          fill={h.line.color}
                          fillOpacity={0.18}
                        />
                      )}
                      <circle
                        cx={hover.x}
                        cy={yScale(h.v)}
                        r={
                          focusSymbol === h.line.symbol
                            ? 4
                            : hasFocus
                              ? 2
                              : 3.2
                        }
                        fill={h.line.color}
                        stroke="rgba(0,0,0,0.7)"
                        strokeWidth={1}
                        opacity={hasFocus && focusSymbol !== h.line.symbol ? 0.35 : 1}
                      />
                    </g>
                  ),
              )}
            </g>
          )}

          {hasData && (
            <>
              <text
                x={padL}
                y={H - 6}
                fill="rgba(255,255,255,0.35)"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {fmtTime(tMin)}
              </text>
              <text
                x={W - padR}
                y={H - 6}
                textAnchor="end"
                fill="rgba(255,255,255,0.35)"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {fmtTime(tMax)} · {fmtSpan(tMax - tMin)}
              </text>
            </>
          )}
        </svg>

        {hover && hoverValues && (
          <HoverTooltip
            chartWidth={W}
            x={hover.x}
            ts={hover.ts}
            median={median}
            focusSymbol={focusSymbol}
            rows={hoverValues
              .filter((h) => Number.isFinite(h.v))
              .map((h) => ({
                symbol: h.line.symbol,
                color: h.line.color,
                v: h.v,
              }))}
          />
        )}

        {selectedPoint && (
          <div className="absolute inset-x-3 top-2 z-10">
            <div className="relative">
              <ProxyTooltip point={selectedPoint} status={selectedStatus} />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="close venue detail"
                className="absolute top-2 right-2 w-5 h-5 rounded text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800/60 text-xs leading-none flex items-center justify-center"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-zinc-800/60 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono overflow-y-auto">
        {lines
          .slice()
          .sort((a, b) => {
            const av = Number.isFinite(a.latest) ? a.latest : -Infinity;
            const bv = Number.isFinite(b.latest) ? b.latest : -Infinity;
            return bv - av;
          })
          .map((l) => {
            const isSelected = selected === l.symbol;
            const isFocused = focusSymbol === l.symbol;
            const delta =
              Number.isFinite(l.latest) && Number.isFinite(median) && median !== 0
                ? ((l.latest - median) / median) * 10_000
                : NaN;
            return (
              <button
                type="button"
                key={l.symbol}
                onClick={() => setSelected(isSelected ? null : l.symbol)}
                onMouseEnter={() => setHoveredSymbol(l.symbol)}
                onMouseLeave={() => setHoveredSymbol(null)}
                className={`flex items-center justify-between gap-2 truncate text-left px-1 py-0.5 rounded transition-colors ${
                  isSelected
                    ? "bg-zinc-800/70 ring-1 ring-zinc-600"
                    : isFocused
                      ? "bg-zinc-800/40"
                      : "hover:bg-zinc-800/30"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor: l.color,
                      boxShadow: isFocused
                        ? `0 0 0 2px ${l.color}33`
                        : undefined,
                    }}
                  />
                  <span className="text-zinc-200 truncate">{l.symbol}</span>
                  {l.emphasis && (
                    <span className="text-[8px] text-amber-400/80 uppercase tracking-wider">
                      live
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-zinc-400 tabular-nums">
                    {Number.isFinite(l.latest) ? fmtNum(l.latest, 2) : "—"}
                  </span>
                  <span
                    className={`tabular-nums text-[9px] ${deltaClass(delta)}`}
                    style={{ minWidth: 36, textAlign: "right" }}
                  >
                    {Number.isFinite(delta)
                      ? `${delta >= 0 ? "+" : ""}${fmtNum(delta, 0)}`
                      : "—"}
                  </span>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}

function HoverTooltip(props: {
  chartWidth: number;
  x: number;
  ts: number;
  median: number;
  focusSymbol: string | null;
  rows: { symbol: string; color: string; v: number }[];
}) {
  const flipLeft = props.x > props.chartWidth / 2;
  const focusedFirst = useMemo(() => {
    const focused = props.rows.filter((r) => r.symbol === props.focusSymbol);
    const others = props.rows
      .filter((r) => r.symbol !== props.focusSymbol)
      .slice()
      .sort((a, b) => b.v - a.v);
    return [...focused, ...others].slice(0, 8);
  }, [props.rows, props.focusSymbol]);

  return (
    <div
      className="pointer-events-none absolute top-2 glass rounded-md text-[10px] font-mono shadow-xl ring-1 ring-zinc-700/40"
      style={{
        minWidth: 188,
        ...(flipLeft
          ? { right: `${props.chartWidth - props.x + 10}px` }
          : { left: `${props.x + 10}px` }),
      }}
    >
      <div className="px-2.5 pt-1.5 pb-1 border-b border-zinc-800/70 flex items-center justify-between">
        <span className="text-zinc-300 text-[10px] tabular-nums tracking-tight">
          {fmtTimeSec(props.ts)}
        </span>
        <span className="text-zinc-500 text-[9px] uppercase tracking-wider">
          {focusedFirst.length} venues
        </span>
      </div>
      <div className="px-2.5 py-1.5 space-y-[2px]">
        {focusedFirst.map((r) => {
          const delta =
            Number.isFinite(props.median) && props.median !== 0
              ? ((r.v - props.median) / props.median) * 10_000
              : NaN;
          const isFocused = r.symbol === props.focusSymbol;
          return (
            <div
              key={r.symbol}
              className={`flex items-center justify-between gap-2 rounded px-1 ${
                isFocused ? "bg-zinc-800/70" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span
                  className={`truncate ${
                    isFocused ? "text-zinc-50 font-semibold" : "text-zinc-200"
                  }`}
                >
                  {r.symbol}
                </span>
              </div>
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-zinc-100 tabular-nums">
                  {fmtNum(r.v, 2)}
                </span>
                <span
                  className={`tabular-nums text-[9px] ${deltaClass(delta)}`}
                  style={{ minWidth: 32, textAlign: "right" }}
                >
                  {Number.isFinite(delta)
                    ? `${delta >= 0 ? "+" : ""}${fmtNum(delta, 0)}`
                    : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function deltaClass(delta: number): string {
  if (!Number.isFinite(delta)) return "text-zinc-600";
  if (delta > 5) return "text-emerald-400";
  if (delta < -5) return "text-rose-400";
  return "text-zinc-500";
}

function nearestIndex(sortedAsc: number[], target: number): number {
  let lo = 0, hi = sortedAsc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sortedAsc[lo - 1] - target) < Math.abs(sortedAsc[lo] - target)) {
    return lo - 1;
  }
  return lo;
}

function fmtNum(x: number, digits: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function fmtTimeSec(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function fmtSpan(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const m = Math.round(seconds / 60);
  if (m < 1) return `${Math.round(seconds)}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function niceTicks(lo: number, hi: number, n: number): number[] {
  const span = hi - lo;
  if (span <= 0 || !Number.isFinite(span)) return [];
  const rawStep = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = first; v <= hi; v += step) {
    const rounded = Math.round(v / step) * step;
    if (out.length === 0 || rounded !== out[out.length - 1]) out.push(rounded);
  }
  return out;
}

export type { DriftSample };
