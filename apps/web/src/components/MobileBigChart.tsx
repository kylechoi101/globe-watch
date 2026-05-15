import { useMemo } from "react";
import type {
  AssetUniverseEntry,
  DriftPoint,
} from "@globe-watch/shared";
import { useStore } from "../state/store";

const PALETTE: Record<string, string> = {
  GLD: "#facc15",
  IAU: "#fbbf24",
  "CGL.TO": "#fb923c",
  "IAU.TO": "#f97316",
  "SGLN.L": "#22d3ee",
  "PHAU.L": "#0ea5e9",
  "4GLD.DE": "#a78bfa",
  "1326.T": "#f472b6",
  "2840.HK": "#34d399",
  "GOLD.AX": "#84cc16",
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
}

/**
 * Mobile-only hero card for big_chart assets (BTC, gold). Mirrors the
 * desktop BigPriceChart's information density in a portrait, top-right
 * shape: prominent median price + spread + sparkline up top, compact
 * 2-column venue grid below.
 */
export function MobileBigChart(props: Props) {
  const history = useStore((s) => s.history);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);
  const divisor = props.asset.display_divisor ?? 1;
  const unit = props.asset.display_unit ?? "USD";

  // Per-venue current value in display units.
  const venues = useMemo(
    () =>
      props.points.map((p) => ({
        symbol: p.symbol,
        currency: p.proxy.currency,
        city: p.proxy.city,
        color: PALETTE[p.symbol] ?? "#e5e7eb",
        emphasis: p.is_reference,
        value: Number.isFinite(p.implied_usd) ? p.implied_usd / divisor : NaN,
      })),
    [props.points, divisor],
  );

  const valid = venues.map((v) => v.value).filter((v) => Number.isFinite(v));
  const sorted = [...valid].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
  const spread = sorted.length ? sorted[sorted.length - 1] - sorted[0] : NaN;
  const spreadBps =
    Number.isFinite(spread) && Number.isFinite(median) && median !== 0
      ? (spread / median) * 10_000
      : NaN;

  // Reference sparkline + movement % since first sample.
  const ref =
    props.points.find((p) => p.is_reference) ?? props.points[0] ?? null;
  const refSamples = ref ? history[ref.symbol] ?? [] : [];

  const spark = useMemo(() => {
    const W = 184;
    const H = 38;
    const us = refSamples
      .map((s) => ({
        ts: s.ts,
        v: Number.isFinite(s.implied_usd) ? s.implied_usd / divisor : NaN,
      }))
      .filter((s) => Number.isFinite(s.v));
    if (us.length < 2)
      return { W, H, line: "", area: "", color: "#71717a", first: NaN, last: NaN };
    let lo = Infinity,
      hi = -Infinity,
      t0 = Infinity,
      t1 = -Infinity;
    for (const s of us) {
      if (s.v < lo) lo = s.v;
      if (s.v > hi) hi = s.v;
      if (s.ts < t0) t0 = s.ts;
      if (s.ts > t1) t1 = s.ts;
    }
    const pad = Math.max((hi - lo) * 0.2, hi * 0.0005, 1e-9);
    lo -= pad;
    hi += pad;
    const ySpan = Math.max(1e-9, hi - lo);
    const tSpan = Math.max(1, t1 - t0);
    const coords = us.map((s) => ({
      x: ((s.ts - t0) / tSpan) * W,
      y: H - ((s.v - lo) / ySpan) * H,
    }));
    const line = coords
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const area = `0,${H} ${line} ${W},${H}`;
    const first = us[0].v;
    const last = us[us.length - 1].v;
    const color = last >= first ? "#34d399" : "#f43f5e";
    return { W, H, line, area, color, first, last };
  }, [refSamples, divisor]);

  const pct =
    Number.isFinite(spark.first) && Number.isFinite(spark.last) && spark.first !== 0
      ? ((spark.last - spark.first) / spark.first) * 100
      : NaN;
  const movementColor = pct >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="md:hidden absolute top-14 right-3 w-[220px] z-10 glass rounded-md text-zinc-200 font-mono pointer-events-auto overflow-hidden">
      <div className="px-2.5 pt-2 pb-2 border-b border-zinc-800/60">
        <div className="flex items-baseline justify-between text-[9px] uppercase tracking-[0.12em] text-zinc-500">
          <span>
            {props.asset.display_name} · {unit}
          </span>
          <span>
            {Number.isFinite(spreadBps) ? `${spreadBps.toFixed(0)} bps` : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-0.5">
          <span className="text-[20px] leading-none font-semibold tabular-nums text-zinc-50 tracking-tight">
            {Number.isFinite(median) ? fmt(median, 2) : "—"}
          </span>
          {Number.isFinite(pct) && (
            <span className={`text-[11px] tabular-nums ${movementColor}`}>
              {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
            </span>
          )}
        </div>
        <svg
          viewBox={`0 0 ${spark.W} ${spark.H}`}
          width={spark.W}
          height={spark.H}
          className="block mt-1"
        >
          <defs>
            <linearGradient id="mbc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={spark.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={spark.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {spark.line ? (
            <>
              <polygon points={spark.area} fill="url(#mbc-fill)" />
              <polyline
                points={spark.line}
                fill="none"
                stroke={spark.color}
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : (
            <text
              x={spark.W / 2}
              y={spark.H / 2 + 3}
              textAnchor="middle"
              fill="rgba(255,255,255,0.35)"
              fontSize={9}
              fontFamily="ui-monospace, monospace"
            >
              collecting samples…
            </text>
          )}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-2 py-1.5 text-[10px] max-h-[200px] overflow-y-auto">
        {venues
          .slice()
          .sort((a, b) => {
            const av = Number.isFinite(a.value) ? a.value : -Infinity;
            const bv = Number.isFinite(b.value) ? b.value : -Infinity;
            return bv - av;
          })
          .map((v) => {
            const delta =
              Number.isFinite(v.value) && Number.isFinite(median) && median !== 0
                ? ((v.value - median) / median) * 10_000
                : NaN;
            return (
              <button
                type="button"
                key={v.symbol}
                onTouchStart={() => setHoveredSymbol(v.symbol)}
                onTouchEnd={() => setHoveredSymbol(null)}
                className="flex items-center justify-between gap-1 px-1 py-0.5 rounded hover:bg-zinc-800/40 text-left"
              >
                <span className="flex items-center gap-1 min-w-0">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: v.color }}
                  />
                  <span className="text-zinc-300 truncate">{v.currency}</span>
                </span>
                <span className="flex items-baseline gap-1 shrink-0">
                  <span className="text-zinc-100 tabular-nums">
                    {Number.isFinite(v.value) ? fmt(v.value, 0) : "—"}
                  </span>
                  <span
                    className={`text-[8px] tabular-nums ${deltaClass(delta)}`}
                  >
                    {Number.isFinite(delta)
                      ? `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`
                      : ""}
                  </span>
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

function fmt(x: number, digits: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function deltaClass(delta: number): string {
  if (!Number.isFinite(delta)) return "text-zinc-600";
  if (delta > 5) return "text-emerald-400";
  if (delta < -5) return "text-rose-400";
  return "text-zinc-500";
}
