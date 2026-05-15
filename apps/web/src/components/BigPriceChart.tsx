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
  "IAU.TO": "#f97316",
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
  ts: number; // unix seconds — snapped to nearest sample
  x: number;  // screen x in svg coords
}

export function BigPriceChart(props: Props) {
  const history = useStore((s) => s.history);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);
  const divisor = props.asset.display_divisor ?? 1;
  const unit = props.asset.display_unit ?? "USD";

  const [hover, setHover] = useState<HoverState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const lines = useMemo(
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

  // ----- chart bounds -----
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

  const W = 460, H = 360;
  const padL = 64, padR = 12, padT = 18, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xScale = (ts: number) =>
    padL + (innerW * (ts - tMin)) / Math.max(1, tMax - tMin);
  const yScale = (v: number) =>
    padT + innerH * (1 - (v - yMin) / Math.max(1e-9, yMax - yMin));

  const yTicks = niceTicks(yMin, yMax, 5);

  // Pre-compute the union of every sample timestamp so we can snap the
  // hover cursor to the nearest real sample instead of interpolating.
  const allTimestamps = useMemo(() => {
    const s = new Set<number>();
    for (const l of lines) for (const p of l.samples) if (Number.isFinite(p.v)) s.add(p.ts);
    return Array.from(s).sort((a, b) => a - b);
  }, [lines]);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hasData || !svgRef.current || allTimestamps.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    // Account for SVG's intrinsic size vs. its rendered size — the svg
    // has width=W/height=H attributes but CSS can scale it.
    const scaleX = W / rect.width;
    const px = (e.clientX - rect.left) * scaleX;
    if (px < padL || px > W - padR) {
      setHover(null);
      return;
    }
    const tsCursor = tMin + ((px - padL) * (tMax - tMin)) / Math.max(1, innerW);
    // Binary-search the nearest sample ts.
    const idx = nearestIndex(allTimestamps, tsCursor);
    const ts = allTimestamps[idx];
    setHover({ ts, x: xScale(ts) });
  }

  function onMouseLeave() {
    setHover(null);
  }

  // Look up each line's value at the hover timestamp (exact match — we
  // snapped to a sample ts that exists somewhere in the chart, though
  // not every line necessarily has a sample at that exact ts).
  const hoverValues = useMemo(() => {
    if (!hover) return null;
    return lines.map((l) => {
      const s = l.samples.find((p) => p.ts === hover.ts);
      return { line: l, v: s && Number.isFinite(s.v) ? s.v : NaN };
    });
  }, [hover, lines]);

  const selectedPoint = selected
    ? props.points.find((p) => p.symbol === selected) ?? null
    : null;
  const selectedStatus = selectedPoint
    ? props.statuses[selectedPoint.proxy.exchange_mic]
    : undefined;

  return (
    <div className="absolute top-16 right-4 bottom-4 w-[480px] glass rounded-lg flex flex-col pointer-events-auto">
      <header className="px-3 pt-2 pb-1 border-b border-zinc-800/50">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
            {unit} · {lines.length} venues
          </span>
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
            spread {Number.isFinite(spread) ? fmtNum(spread, 2) : "—"}
          </span>
        </div>
        <div className="font-mono text-3xl font-semibold text-zinc-100 tabular-nums leading-tight">
          {Number.isFinite(median) ? fmtNum(median, 2) : "—"}
          <span className="text-sm text-zinc-500 ml-1.5">{unit}</span>
        </div>
      </header>

      <div className="relative">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          className="block mx-auto"
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={W - padR}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="2 3"
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
              const isSelected = selected === l.symbol;
              const isDimmed = selected !== null && !isSelected;
              const baseWidth = l.emphasis ? 2 : 1.25;
              return (
                <g key={l.symbol}>
                  {/* Invisible thick stroke for easier click/hover pickup */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredSymbol(l.symbol)}
                    onMouseLeave={() => setHoveredSymbol(null)}
                    onClick={() => setSelected(l.symbol)}
                  />
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={isSelected ? baseWidth + 1 : baseWidth}
                    strokeOpacity={isDimmed ? 0.2 : l.emphasis ? 1 : 0.75}
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
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {hoverValues.map(
                (h) =>
                  Number.isFinite(h.v) && (
                    <circle
                      key={h.line.symbol}
                      cx={hover.x}
                      cy={yScale(h.v)}
                      r={3}
                      fill={h.line.color}
                      stroke="rgba(0,0,0,0.6)"
                      strokeWidth={1}
                    />
                  ),
              )}
            </g>
          )}

          {hasData && (
            <>
              <text x={padL} y={H - 8} fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="ui-monospace, monospace">
                {fmtTime(tMin)}
              </text>
              <text x={W - padR} y={H - 8} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={9} fontFamily="ui-monospace, monospace">
                {fmtTime(tMax)}
              </text>
            </>
          )}
        </svg>

        {hover && hoverValues && (
          <HoverTooltip
            chartWidth={W}
            x={hover.x}
            ts={hover.ts}
            rows={hoverValues
              .filter((h) => Number.isFinite(h.v))
              .sort((a, b) => b.v - a.v)
              .slice(0, 8)
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

      <div className="px-3 py-2 border-t border-zinc-800/50 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono overflow-y-auto">
        {lines.map((l) => {
          const isSelected = selected === l.symbol;
          return (
            <button
              type="button"
              key={l.symbol}
              onClick={() => setSelected(isSelected ? null : l.symbol)}
              onMouseEnter={() => setHoveredSymbol(l.symbol)}
              onMouseLeave={() => setHoveredSymbol(null)}
              className={`flex items-center justify-between gap-2 truncate text-left px-1 rounded transition-colors ${
                isSelected
                  ? "bg-zinc-800/60 ring-1 ring-zinc-600"
                  : "hover:bg-zinc-800/30"
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: l.color }}
                />
                <span className="text-zinc-200 truncate">{l.symbol}</span>
                {l.emphasis && (
                  <span className="text-[9px] text-amber-400/80 uppercase">live</span>
                )}
              </div>
              <span className="text-zinc-400 tabular-nums shrink-0">
                {Number.isFinite(l.latest) ? fmtNum(l.latest, 2) : "—"}
              </span>
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
  rows: { symbol: string; color: string; v: number }[];
}) {
  // Flip the tooltip to the left side of the crosshair if the cursor is
  // past the chart's midpoint, so it never clips off-screen.
  const flipLeft = props.x > props.chartWidth / 2;
  return (
    <div
      className="pointer-events-none absolute top-2 glass rounded-md px-2 py-1.5 text-[10px] font-mono min-w-[120px] shadow-lg"
      style={
        flipLeft
          ? { right: `${props.chartWidth - props.x + 8}px` }
          : { left: `${props.x + 8}px` }
      }
    >
      <div className="text-zinc-500 mb-0.5 text-[9px] uppercase tracking-wider">
        {fmtTime(props.ts)}
      </div>
      {props.rows.map((r) => (
        <div key={r.symbol} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-zinc-200 truncate">{r.symbol}</span>
          </div>
          <span className="text-zinc-100 tabular-nums shrink-0">
            {fmtNum(r.v, 2)}
          </span>
        </div>
      ))}
    </div>
  );
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

// Re-export DriftSample so the shape is reachable from this module's
// type-only consumers (kept to satisfy lint).
export type { DriftSample };
