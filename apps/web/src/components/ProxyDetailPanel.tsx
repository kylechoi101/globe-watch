import type { DriftPoint, MarketStatus } from "@globe-watch/shared";
import { useStore } from "../state/store";
import { driftColor } from "../lib/drift";
import { reasonLabel } from "../lib/sessions";

interface Props {
  points: DriftPoint[];
  statuses: Record<string, MarketStatus>;
  referenceSymbol: string | null;
  embedded?: boolean;
}

/**
 * Persistent left-side panel showing detail for the hovered proxy. When
 * nothing is hovered, defaults to the active reference so the panel is
 * never empty.
 */
export function ProxyDetailPanel(props: Props) {
  const hoveredSymbol = useStore((s) => s.hoveredSymbol);
  const fallback = hoveredSymbol
    ? props.points.find((p) => p.symbol === hoveredSymbol)
    : null;
  const point =
    fallback ??
    props.points.find((p) => p.is_reference) ??
    props.points[0];
  if (!point) return null;
  const status = props.statuses[point.proxy.exchange_mic];

  const sourceLabel = hoveredSymbol
    ? "hovered"
    : point.is_reference
      ? "live reference"
      : "current view";

  const driftLabel = Number.isFinite(point.drift_bps)
    ? `${point.drift_bps >= 0 ? "+" : ""}${point.drift_bps.toFixed(1)} bps`
    : "—";

  return (
    <div
      className={
        props.embedded
          ? "px-3 py-3 text-zinc-200"
          : "absolute left-4 top-20 w-[280px] glass rounded-lg px-3 py-2 text-zinc-200 pointer-events-none hidden md:block"
      }
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-base font-semibold text-zinc-100">
            {point.symbol}
          </span>
          <span className="text-[10px] text-zinc-500">{point.proxy.city}</span>
        </div>
        <span className="text-[9px] uppercase tracking-wider text-zinc-600">
          {sourceLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1.5 text-[11px] font-mono">
        <Cell label="last">
          {fmt(point.price_local, 2)}{" "}
          <span className="text-zinc-600">{point.proxy.currency}</span>
        </Cell>
        <Cell label="drift">
          <span style={{ color: driftColor(point.drift_bps) }}>{driftLabel}</span>
        </Cell>
        <Cell label="implied SPX">{fmt(point.implied_usd, 1)}</Cell>
        <Cell label="status">
          <span className="text-[10px]">
            {status ? reasonLabel(status) : "?"}
          </span>
        </Cell>
      </div>
    </div>
  );
}

function Cell(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-zinc-600">
        {props.label}
      </span>
      <span className="text-zinc-100">{props.children}</span>
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
