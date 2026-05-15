import { useEffect, useState } from "react";
import type { DriftPoint } from "@globe-watch/shared";
import { useStore, type DriftSample } from "../state/store";
import { driftColor } from "../lib/drift";
import { MiniChart, type ChartLine } from "./MiniChart";

interface Props {
  points: DriftPoint[];
  referenceSymbol: string | null;
  /** If true, hide on md+ screens (because BigPriceChart takes over on desktop). */
  desktopHidden?: boolean;
}

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const onR = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return mobile;
}

const PROXY_PALETTE: Record<string, string> = {
  SPY: "#facc15",       // amber
  "VFV.TO": "#fb923c",  // orange
  "CSPX.L": "#22d3ee",  // cyan
  "CSPX.AS": "#a78bfa", // violet
  "1547.T": "#f472b6",  // pink
  "IVV.AX": "#34d399",  // emerald
};

export function ChartsPanel(props: Props) {
  const history = useStore((s) => s.history);
  const isMobile = useIsMobile();
  const desktopVis = props.desktopHidden ? "md:hidden" : "md:flex";

  return (
    <div
      className={`absolute top-14 right-3 bottom-28 flex flex-col gap-1.5 overflow-y-auto pointer-events-none md:top-16 md:right-4 md:bottom-4 ${desktopVis}`}
    >
      {props.points.map((p) => (
        <ProxyCard
          key={p.symbol}
          point={p}
          referenceSymbol={props.referenceSymbol}
          samples={history[p.symbol] ?? []}
          isMobile={isMobile}
        />
      ))}
    </div>
  );
}

function ProxyCard(props: {
  point: DriftPoint;
  referenceSymbol: string | null;
  samples: DriftSample[];
  isMobile: boolean;
}) {
  const { point, referenceSymbol, samples, isMobile } = props;
  const cardW = isMobile ? 156 : 220;
  const chartW = isMobile ? 140 : 204;
  const chartH = isMobile ? 54 : 70;
  const color = PROXY_PALETTE[point.symbol] ?? "#e5e7eb";
  const isReference = point.is_reference;

  // Two lines only:
  //   - the "live" reference baseline (flat zero, by definition of drift)
  //   - the "original" proxy's drift over time (colored)
  // Visual gap = the drift being highlighted.
  const referenceLine: ChartLine = {
    symbol: referenceSymbol ?? "ref",
    color: "rgba(255,255,255,0.55)",
    emphasis: false,
    samples: samples.map((s) => ({ ts: s.ts, drift_bps: 0, implied_usd: NaN })),
  };
  const proxyLine: ChartLine = {
    symbol: point.symbol,
    color,
    emphasis: true,
    samples,
  };
  const lines = isReference ? [proxyLine] : [referenceLine, proxyLine];

  return (
    <div
      className="glass rounded-md px-2 py-1 md:px-2.5 md:py-1.5 text-zinc-200 pointer-events-auto"
      style={{ width: cardW }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-mono text-[12px] font-semibold tracking-tight truncate">
            {point.symbol}
          </span>
          {isReference && (
            <span className="text-[9px] text-amber-400/80 uppercase tracking-wider">
              live
            </span>
          )}
        </div>
        <span
          className="font-mono text-[11px] font-semibold tabular-nums"
          style={{
            color: Number.isFinite(point.drift_bps)
              ? driftColor(point.drift_bps)
              : "rgba(255,255,255,0.4)",
          }}
        >
          {Number.isFinite(point.drift_bps)
            ? `${point.drift_bps >= 0 ? "+" : ""}${point.drift_bps.toFixed(1)}`
            : "—"}
        </span>
      </div>
      <MiniChart lines={lines} width={chartW} height={chartH} />
    </div>
  );
}
