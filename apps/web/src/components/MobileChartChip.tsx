import { useMemo } from "react";
import type {
  AssetUniverseEntry,
  DriftPoint,
} from "@globe-watch/shared";
import { useStore } from "../state/store";
import { driftColor } from "../lib/drift";

interface Props {
  asset: AssetUniverseEntry | null;
  points: DriftPoint[];
}

/**
 * Mobile-only top-right chip: live readout for the active asset.
 *   - big_chart assets (gold/BTC) → median implied USD + spread bps
 *   - drift assets (equity indexes) → widest drift in bps
 * Plus a tiny sparkline of the reference proxy's recent samples.
 */
export function MobileChartChip(props: Props) {
  const history = useStore((s) => s.history);
  const isBigChart = props.asset?.display_mode === "big_chart";
  const divisor = props.asset?.display_divisor ?? 1;
  const unit = props.asset?.display_unit ?? "";

  const valid = props.points.filter((p) => Number.isFinite(p.drift_bps));
  const widest = valid.length
    ? valid.reduce((a, b) =>
        Math.abs(a.drift_bps) > Math.abs(b.drift_bps) ? a : b,
      )
    : null;

  const validUsd = props.points
    .map((p) => (Number.isFinite(p.implied_usd) ? p.implied_usd / divisor : NaN))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const median = validUsd.length
    ? validUsd[Math.floor(validUsd.length / 2)]
    : NaN;
  const spread = validUsd.length
    ? validUsd[validUsd.length - 1] - validUsd[0]
    : NaN;
  const spreadBps =
    Number.isFinite(spread) && Number.isFinite(median) && median !== 0
      ? (spread / median) * 10_000
      : NaN;

  const ref = props.points.find((p) => p.is_reference) ?? props.points[0];
  const samples = ref ? history[ref.symbol] ?? [] : [];

  const spark = useMemo(() => {
    const W = 120;
    const H = 32;
    const usable = samples
      .map((s) =>
        isBigChart
          ? { ts: s.ts, v: Number.isFinite(s.implied_usd) ? s.implied_usd / divisor : NaN }
          : { ts: s.ts, v: s.drift_bps },
      )
      .filter((s) => Number.isFinite(s.v));
    if (usable.length < 2) return { W, H, points: "", color: "#71717a" };
    let lo = Infinity,
      hi = -Infinity,
      t0 = Infinity,
      t1 = -Infinity;
    for (const s of usable) {
      if (s.v < lo) lo = s.v;
      if (s.v > hi) hi = s.v;
      if (s.ts < t0) t0 = s.ts;
      if (s.ts > t1) t1 = s.ts;
    }
    const ySpan = Math.max(1e-9, hi - lo);
    const tSpan = Math.max(1, t1 - t0);
    const pts = usable
      .map((s) => {
        const x = ((s.ts - t0) / tSpan) * W;
        const y = H - ((s.v - lo) / ySpan) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const last = usable[usable.length - 1].v;
    const first = usable[0].v;
    const color = isBigChart
      ? last >= first
        ? "#34d399"
        : "#f43f5e"
      : driftColor(last);
    return { W, H, points: pts, color };
  }, [samples, isBigChart, divisor]);

  if (!props.asset) return null;

  return (
    <div className="md:hidden absolute top-3 right-3 glass rounded-md px-2.5 py-1.5 text-zinc-200 font-mono z-20 min-w-[140px]">
      {isBigChart ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">
              {unit}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">
              {Number.isFinite(spreadBps) ? `${spreadBps.toFixed(0)} bps` : "—"}
            </span>
          </div>
          <div className="text-[15px] font-semibold tabular-nums text-zinc-50 leading-tight">
            {Number.isFinite(median) ? fmt(median, 2) : "—"}
          </div>
        </>
      ) : (
        <>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">
            widest drift
          </div>
          <div
            className="text-[15px] font-semibold tabular-nums leading-tight"
            style={{
              color: widest ? driftColor(widest.drift_bps) : "#a1a1aa",
            }}
          >
            {widest
              ? `${widest.drift_bps >= 0 ? "+" : ""}${widest.drift_bps.toFixed(1)} bps`
              : "—"}
          </div>
        </>
      )}
      <svg
        width={spark.W}
        height={spark.H}
        viewBox={`0 0 ${spark.W} ${spark.H}`}
        className="block mt-0.5"
      >
        {spark.points && (
          <polyline
            points={spark.points}
            fill="none"
            stroke={spark.color}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
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
