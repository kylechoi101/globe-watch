import { useMemo } from "react";
import type { DriftPoint, AssetUniverseEntry } from "@globe-watch/shared";
import { useStore, type DriftSample } from "../state/store";

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
}

export function BigPriceChart(props: Props) {
  const history = useStore((s) => s.history);
  const divisor = props.asset.display_divisor ?? 1;
  const unit = props.asset.display_unit ?? "USD";

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

      <svg width={W} height={H} className="block mx-auto">
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
            return (
              <polyline
                key={l.symbol}
                points={pts}
                fill="none"
                stroke={l.color}
                strokeWidth={l.emphasis ? 2 : 1.25}
                strokeOpacity={l.emphasis ? 1 : 0.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
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

      <div className="px-3 py-2 border-t border-zinc-800/50 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono overflow-y-auto">
        {lines.map((l) => (
          <div key={l.symbol} className="flex items-center justify-between gap-2 truncate">
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
          </div>
        ))}
      </div>
    </div>
  );
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
