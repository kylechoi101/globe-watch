import type { DriftPoint, MarketStatus } from "@globe-watch/shared";
import { reasonLabel } from "../lib/sessions";

export function ProxyTooltip(props: {
  point: DriftPoint;
  status: MarketStatus | undefined;
}) {
  const { point, status } = props;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs font-mono leading-relaxed text-zinc-100 shadow-xl min-w-[240px]">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold">{point.proxy.symbol}</span>
        <span className="text-zinc-400">{point.proxy.city}</span>
        {point.is_reference && (
          <span className="ml-auto text-amber-400">★ reference</span>
        )}
      </div>
      <div className="text-zinc-300">{point.proxy.name}</div>
      <hr className="my-1 border-zinc-700" />
      <Row label="Last price" value={fmt(point.price_local, 2) + " " + point.proxy.currency} />
      <Row label="FX → USD" value={point.proxy.fx_symbol ? fmt(point.fx_to_usd, 5) : "—"} />
      <Row label="Implied SPX" value={fmt(point.implied_usd, 1)} />
      <Row
        label="Drift vs ref"
        value={
          Number.isFinite(point.drift_bps)
            ? `${point.drift_bps >= 0 ? "+" : ""}${point.drift_bps.toFixed(1)} bps`
            : "—"
        }
      />
      <Row
        label="Status"
        value={status ? reasonLabel(status) : "?"}
      />
      <Row
        label="Stale"
        value={
          Number.isFinite(point.staleness_seconds)
            ? `${Math.round(point.staleness_seconds)}s`
            : "—"
        }
      />
    </div>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{props.label}</span>
      <span>{props.value}</span>
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
