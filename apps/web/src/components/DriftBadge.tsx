import type { DriftPoint } from "@globe-watch/shared";

export function DriftBadge(props: { points: DriftPoint[] }) {
  const valid = props.points.filter((p) => Number.isFinite(p.drift_bps));
  if (valid.length === 0) return null;
  const max = valid.reduce((a, b) =>
    Math.abs(a.drift_bps) > Math.abs(b.drift_bps) ? a : b,
  );

  return (
    <div className="absolute top-3 left-3 md:top-4 md:left-4 glass rounded-lg px-2.5 py-1.5 md:px-3 md:py-2 text-xs font-mono text-zinc-200">
      <div className="flex items-baseline gap-1.5 md:gap-2">
        <span className="hidden md:inline text-[9px] uppercase tracking-wider text-zinc-500">
          widest drift
        </span>
        <span className="md:hidden text-[9px] uppercase tracking-wider text-zinc-500">
          drift
        </span>
        <span className="text-sm md:text-lg font-semibold text-zinc-100">
          {max.drift_bps >= 0 ? "+" : ""}
          {max.drift_bps.toFixed(1)}
          <span className="text-[9px] md:text-[10px] text-zinc-500 ml-0.5">bps</span>
        </span>
      </div>
      <div className="hidden md:block text-[10px] text-zinc-500">
        {max.proxy.symbol} · {max.proxy.city}
      </div>
    </div>
  );
}
