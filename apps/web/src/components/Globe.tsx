import { useEffect, useMemo, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import type {
  DriftPoint,
  MarketStatus,
  NewsArticle,
} from "@globe-watch/shared";
import { useStore } from "../state/store";
import { driftColor } from "../lib/drift";
import {
  createDayNightMaterial,
  updateSunUniform,
} from "../lib/dayNightShader";

interface Props {
  driftPoints: DriftPoint[];
  statuses: Record<string, MarketStatus>;
  newsArticles: NewsArticle[];
  followSun: boolean;
  is24_7: boolean;
  width: number;
  height: number;
}

interface NewsPing {
  url: string;
  lat: number;
  lon: number;
  title: string;
  domain: string;
  source_country: string;
}

interface PointDatum extends DriftPoint {
  open: boolean;
  size: number;
  color: string;
  ringColor: string;
}

export function Globe(props: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const material = useMemo(() => createDayNightMaterial(), []);
  const setHoveredSymbol = useStore((s) => s.setHoveredSymbol);
  const cameraTarget = useStore((s) => s.cameraTarget);
  const selectedArticleUrl = useStore((s) => s.selectedArticleUrl);
  const selectArticle = useStore((s) => s.selectArticle);

  // Refresh sun direction once a minute. The terminator only sweeps
  // ~0.25 deg/minute, so this rate is more than enough.
  useEffect(() => {
    updateSunUniform(material);
    const t = setInterval(() => updateSunUniform(material), 60_000);
    return () => clearInterval(t);
  }, [material]);

  // Escape clears any selected article.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") selectArticle(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectArticle]);

  // Imperative camera fly when the store's cameraTarget changes.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !cameraTarget) return;
    g.pointOfView(
      { lat: cameraTarget.lat, lng: cameraTarget.lng, altitude: 1.9 },
      1600,
    );
  }, [cameraTarget]);

  // Follow-the-index camera: aim where the asset is currently being
  // traded live. Priority:
  //   1. 24/7 assets (BTC, gold spot-style) → always track the longitude
  //      where local time is 09:00 — the "dawn of the trading day".
  //   2. Reference proxy whose exchange is open.
  //   3. Any other proxy whose exchange is open.
  //   4. Fallback: longitude with local time 09:00 (lat 0).
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    if (!props.followSun) return;

    const aimAt9am = (): { lat: number; lng: number } => {
      const utcHours =
        new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
      let lon = 15 * (9 - utcHours);
      lon = ((lon + 540) % 360) - 180;
      return { lat: 0, lng: lon };
    };

    const aim = () => {
      let target: { lat: number; lng: number };
      if (props.is24_7) {
        target = aimAt9am();
      } else {
        const openProxies = props.driftPoints.filter(
          (p) => props.statuses[p.proxy.exchange_mic]?.is_open,
        );
        const ref = openProxies.find((p) => p.is_reference);
        const pick = ref ?? openProxies[0];
        target = pick
          ? { lat: pick.proxy.lat, lng: pick.proxy.lon }
          : aimAt9am();
      }
      g.pointOfView(
        { lat: target.lat, lng: target.lng, altitude: 2.3 },
        2500,
      );
    };
    aim();
    const t = setInterval(aim, 60_000);
    return () => clearInterval(t);
  }, [props.followSun, props.is24_7, props.driftPoints, props.statuses]);

  const newsPings: NewsPing[] = useMemo(
    () =>
      props.newsArticles
        .filter((a) => a.lat != null && a.lon != null)
        // Lightly jitter overlapping pings so multiple US-source articles
        // don't stack into a single unclickable dot.
        .map((a, idx, arr) => {
          const dupes = arr.filter(
            (x) => x.lat === a.lat && x.lon === a.lon,
          ).length;
          const myIdx = arr
            .slice(0, idx)
            .filter((x) => x.lat === a.lat && x.lon === a.lon).length;
          const angle = dupes > 1 ? (myIdx / dupes) * Math.PI * 2 : 0;
          const r = dupes > 1 ? 2.2 : 0;
          return {
            url: a.url,
            lat: (a.lat as number) + Math.sin(angle) * r,
            lon: (a.lon as number) + Math.cos(angle) * r,
            title: a.title,
            domain: a.domain,
            source_country: a.source_country,
          };
        }),
    [props.newsArticles],
  );

  // Project the selected ping's lat/lon to 2D screen coordinates so we can
  // render the headline label as a regular React overlay rather than letting
  // three-globe own the DOM lifecycle (which froze the render loop).
  const [calloutPos, setCalloutPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const selectedPing = useMemo(
    () => newsPings.find((p) => p.url === selectedArticleUrl) ?? null,
    [newsPings, selectedArticleUrl],
  );

  useEffect(() => {
    if (!selectedPing) {
      setCalloutPos(null);
      return;
    }
    const tick = () => {
      const g = globeRef.current;
      if (!g?.getScreenCoords) return;
      const coords = g.getScreenCoords(
        selectedPing.lat,
        selectedPing.lon,
        0.012,
      ) as { x: number; y: number; z?: number };
      const onFront = (coords.z ?? 0) < 1; // z > 1 ≈ behind the globe
      setCalloutPos({ x: coords.x, y: coords.y, visible: onFront });
    };
    tick();
    const t = setInterval(tick, 60);
    return () => clearInterval(t);
  }, [selectedPing]);

  const points: PointDatum[] = useMemo(
    () =>
      props.driftPoints.map((p) => {
        const open = props.statuses[p.proxy.exchange_mic]?.is_open ?? false;
        return {
          ...p,
          open,
          size: open ? 0.9 : 0.55,
          color: open ? "rgb(110,231,183)" : "rgb(120,120,140)",
          ringColor: driftColor(p.drift_bps),
        };
      }),
    [props.driftPoints, props.statuses],
  );

  return (
    <div className="relative w-full h-full">
      <GlobeGL
        ref={globeRef}
        width={props.width}
        height={props.height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={material}
        globeImageUrl="https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg"
        showAtmosphere
        atmosphereColor="#3a6da3"
        atmosphereAltitude={0.12}
        onGlobeClick={() => selectArticle(null)}
        pointsData={points}
        pointLat={(d) => (d as PointDatum).proxy.lat}
        pointLng={(d) => (d as PointDatum).proxy.lon}
        pointAltitude={(d) => ((d as PointDatum).open ? 0.05 : 0.02)}
        pointRadius={(d) => (d as PointDatum).size}
        pointColor={(d) => (d as PointDatum).color}
        pointLabel={() => ""}
        onPointHover={(d) =>
          setHoveredSymbol(d ? (d as PointDatum).symbol : null)
        }
        ringsData={points}
        ringLat={(d) => (d as PointDatum).proxy.lat}
        ringLng={(d) => (d as PointDatum).proxy.lon}
        ringColor={((d: PointDatum) => () => d.ringColor) as unknown as (d: object) => string}
        ringMaxRadius={(d) =>
          Number.isFinite((d as PointDatum).drift_bps)
            ? 2 + Math.min(8, Math.abs((d as PointDatum).drift_bps) / 5)
            : 1.5
        }
        ringPropagationSpeed={0.8}
        ringRepeatPeriod={3200}
        labelsData={newsPings}
        labelLat={(d) => (d as NewsPing).lat}
        labelLng={(d) => (d as NewsPing).lon}
        labelText={() => " "}
        labelSize={0.01}
        labelDotRadius={(d) =>
          (d as NewsPing).url === selectedArticleUrl ? 0.55 : 0.32
        }
        labelColor={(d) =>
          (d as NewsPing).url === selectedArticleUrl
            ? "rgba(252, 211, 77, 1)"
            : "rgba(252, 211, 77, 0.85)"
        }
        labelResolution={2}
        labelAltitude={0.012}
        labelLabel={(d) =>
          `<div style="background:rgba(10,10,14,0.88);backdrop-filter:blur(6px);padding:6px 8px;border:1px solid rgba(255,255,255,0.12);border-radius:6px;font-family:ui-monospace,monospace;font-size:11px;color:#fafafa;max-width:280px;white-space:normal">
             <div style="color:#facc15;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px">${(d as NewsPing).domain}</div>
             <div>${(d as NewsPing).title}</div>
           </div>`
        }
        onLabelClick={(d) => {
          const ping = d as NewsPing;
          if (selectedArticleUrl === ping.url) {
            window.open(ping.url, "_blank", "noopener,noreferrer");
            selectArticle(null);
          } else {
            selectArticle(ping.url);
          }
        }}
      />
      {selectedPing && calloutPos?.visible && (
        <div
          className="absolute pointer-events-auto"
          style={{
            left: calloutPos.x,
            top: calloutPos.y,
            transform: "translate(14px, -50%)",
          }}
        >
          <div
            className="relative max-w-[300px] glass rounded-lg border border-amber-400/40"
            style={{ boxShadow: "0 12px 32px -8px rgba(0,0,0,0.55), 0 0 24px -4px rgba(252,211,77,0.30)" }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectArticle(null);
              }}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-zinc-900 border border-amber-400/40 text-amber-300 text-[11px] leading-none hover:bg-amber-500/20 hover:text-white flex items-center justify-center"
              aria-label="unselect article"
              title="Unselect (Esc)"
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => {
                window.open(selectedPing.url, "_blank", "noopener,noreferrer");
                selectArticle(null);
              }}
              className="text-left w-full px-3 py-2 hover:bg-amber-500/5 rounded-lg transition-colors"
              title="Click to open the original article"
            >
              <div className="flex justify-between gap-2 text-[9px] uppercase tracking-wider text-amber-300 mb-0.5">
                <span>{selectedPing.domain}</span>
                <span className="text-zinc-500">{selectedPing.source_country}</span>
              </div>
              <div className="text-[12px] font-mono text-amber-50 leading-snug mb-1">
                {selectedPing.title}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-amber-300">
                click to open ↗
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
