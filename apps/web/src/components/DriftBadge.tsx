import type { DriftPoint } from "@globe-watch/shared";

export function DriftBadge(props: { points: DriftPoint[] }) {
  const valid = props.points.filter((p) => Number.isFinite(p.drift_bps));
  if (valid.length === 0) return null;
  const max = valid.reduce((a, b) =>
    Math.abs(a.drift_bps) > Math.abs(b.drift_bps) ? a : b,
  );

  return (
    <div className="hidden md:block absolute top-4 left-4 glass rounded-lg px-3 py-2 text-xs font-mono text-zinc-200">
      <div className="flex items-baseline gap-2">
        <span className="text-[9px] uppercase tracking-wider text-zinc-500">
          widest drift
        </span>
        <span className="text-lg font-semibold text-zinc-100">
          {max.drift_bps >= 0 ? "+" : ""}
          {max.drift_bps.toFixed(1)}
          <span className="text-[10px] text-zinc-500 ml-0.5">bps</span>
        </span>
      </div>
      <div className="text-[10px] text-zinc-500">
        {max.proxy.symbol} · {max.proxy.city}
      </div>
    </div>
  );
}
