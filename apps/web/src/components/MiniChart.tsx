import { useMemo } from "react";
import type { DriftSample } from "../state/store";

export interface ChartLine {
  symbol: string;
  color: string;
  emphasis?: boolean; // thicker, fully opaque
  samples: DriftSample[];
}

interface Props {
  lines: ChartLine[];
  width: number;
  height: number;
  /** y-axis padding, in bps */
  yPad?: number;
}

export function MiniChart(props: Props) {
  const { lines, width, height, yPad = 2 } = props;

  const { rendered, yMin, yMax, tMin, tMax, hasData } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    let t0 = Infinity;
    let t1 = -Infinity;
    let n = 0;
    for (const l of lines) {
      for (const s of l.samples) {
        if (!Number.isFinite(s.drift_bps)) continue;
        n += 1;
        if (s.drift_bps < lo) lo = s.drift_bps;
        if (s.drift_bps > hi) hi = s.drift_bps;
        if (s.ts < t0) t0 = s.ts;
        if (s.ts > t1) t1 = s.ts;
      }
    }
    if (n === 0 || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      return { rendered: [], yMin: -1, yMax: 1, tMin: 0, tMax: 1, hasData: false };
    }
    // Pad y-axis and force zero to be visible.
    let yMin = Math.min(lo, 0) - yPad;
    let yMax = Math.max(hi, 0) + yPad;
    if (yMax - yMin < 2) {
      const mid = (yMin + yMax) / 2;
      yMin = mid - 1;
      yMax = mid + 1;
    }
    const tSpan = Math.max(1, t1 - t0);
    return {
      rendered: lines,
      yMin,
      yMax,
      tMin: t0,
      tMax: t1,
      tSpan,
      hasData: true,
    };
  }, [lines, yPad]);

  const padL = 24, padR = 4, padT = 4, padB = 12;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xScale = (ts: number) =>
    padL + (innerW * (ts - tMin)) / Math.max(1, tMax - tMin);
  const yScale = (bps: number) =>
    padT + innerH * (1 - (bps - yMin) / (yMax - yMin));

  const yZero = yScale(0);
  const yTicks = niceTicks(yMin, yMax, 4);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block max-w-full"
    >
      {/* y-axis grid + labels */}
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={width - padR}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke={t === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.04)"}
            strokeDasharray={t === 0 ? undefined : "2 3"}
          />
          <text
            x={padL - 3}
            y={yScale(t) + 3}
            textAnchor="end"
            fill="rgba(255,255,255,0.35)"
            fontSize={8}
            fontFamily="ui-monospace, monospace"
          >
            {Math.abs(t) < 0.05 ? "0" : (t >= 0 ? "+" : "") + t.toFixed(0)}
          </text>
        </g>
      ))}

      {/* zero baseline highlight */}
      <line
        x1={padL}
        x2={width - padR}
        y1={yZero}
        y2={yZero}
        stroke="rgba(255,255,255,0.18)"
      />

      {/* lines */}
      {hasData &&
        rendered.map((l) => {
          const pts = l.samples
            .filter((s) => Number.isFinite(s.drift_bps))
            .map((s) => `${xScale(s.ts).toFixed(1)},${yScale(s.drift_bps).toFixed(1)}`)
            .join(" ");
          if (!pts) return null;
          return (
            <polyline
              key={l.symbol}
              points={pts}
              fill="none"
              stroke={l.color}
              strokeWidth={l.emphasis ? 2 : 1.25}
              strokeOpacity={l.emphasis ? 1 : 0.85}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

      {/* x-axis labels: start/end timestamps */}
      {hasData && (
        <>
          <text
            x={padL}
            y={height - 2}
            fill="rgba(255,255,255,0.3)"
            fontSize={8}
            fontFamily="ui-monospace, monospace"
          >
            {fmtTime(tMin)}
          </text>
          <text
            x={width - padR}
            y={height - 2}
            textAnchor="end"
            fill="rgba(255,255,255,0.3)"
            fontSize={8}
            fontFamily="ui-monospace, monospace"
          >
            {fmtTime(tMax)}
          </text>
        </>
      )}

      {!hasData && (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize={10}
          fontFamily="ui-monospace, monospace"
        >
          collecting samples…
        </text>
      )}
    </svg>
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
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
  for (let v = first; v <= hi; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
