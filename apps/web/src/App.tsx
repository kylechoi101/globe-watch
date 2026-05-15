import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { AssetUniverseEntry } from "@globe-watch/shared";
import { useStore, selectActiveAsset, type DriftSample } from "./state/store";
import { useQuotes } from "./hooks/useQuotes";
import { useMarketStatuses } from "./hooks/useMarketStatus";
import { useSeed } from "./hooks/useSeed";
import { computeDrift } from "./lib/drift";
import { api } from "./lib/api";
import type { NewsResponse } from "@globe-watch/shared";
import { Globe } from "./components/Globe";
import { DriftBadge } from "./components/DriftBadge";
import { ChartsPanel } from "./components/ChartsPanel";
import { BigPriceChart } from "./components/BigPriceChart";
import { FollowIndexButton } from "./components/FollowIndexButton";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { ProxyDetailPanel } from "./components/ProxyDetailPanel";
import { NewsPanel } from "./components/NewsPanel";
import { AssetPicker } from "./components/AssetPicker";
import { Footer } from "./components/Footer";
import { TickerButton } from "./components/TickerButton";
import { NewsRotator } from "./components/NewsRotator";

const universeFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ assets: AssetUniverseEntry[] }>);

const newsFetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<NewsResponse>);

const UNIVERSE_KEY = api("/api/universe");

export default function App() {
  const { data: universeData } = useSWR(UNIVERSE_KEY, universeFetcher, {
    revalidateOnFocus: false,
  });
  const setUniverse = useStore((s) => s.setUniverse);
  const followSun = useStore((s) => s.followSun);
  const toggleFollowSun = useStore((s) => s.toggleFollowSun);
  const activeAsset = useStore(selectActiveAsset);
  const activeAssetId = useStore((s) => s.activeAssetId);
  const setActiveAsset = useStore((s) => s.setActiveAsset);
  const universeList = useStore((s) => s.universe);
  const pushDriftSnapshot = useStore((s) => s.pushDriftSnapshot);
  const seedDriftHistory = useStore((s) => s.seedDriftHistory);

  useEffect(() => {
    if (universeData?.assets) setUniverse(universeData.assets);
  }, [universeData, setUniverse]);

  const proxies = activeAsset?.proxies ?? [];
  const symbols = useMemo(() => {
    const s = new Set<string>();
    for (const p of proxies) {
      s.add(p.symbol);
      if (p.fx_symbol) {
        s.add(p.fx_symbol);
        // Also request the opposite-direction FX pair as a defensive
        // fallback. Yahoo truncates many low-magnitude pairs (KRWUSD=X
        // returns 0.0007 instead of 0.000670). drift.ts will pick the
        // higher-precision pair automatically.
        const root = p.fx_symbol.replace("=X", "");
        if (root.length === 6) {
          s.add(root.slice(3, 6) + root.slice(0, 3) + "=X");
        }
      }
    }
    return [...s];
  }, [proxies]);

  const { data: quotesData } = useQuotes(symbols, 5000);
  const { data: seedData } = useSeed(activeAsset?.asset_id ?? null);
  const { statuses: rawStatuses, now } = useMarketStatuses();

  // 24/7 assets (Bitcoin) override per-MIC session status: BTC never
  // closes, so every spot venue is "live" all the time, regardless of
  // whichever stock exchange the proxy is geographically pinned to.
  const statuses = useMemo(() => {
    if (!activeAsset?.trading_24_7) return rawStatuses;
    const o = { ...rawStatuses };
    for (const p of activeAsset.proxies) {
      o[p.exchange_mic] = {
        mic: p.exchange_mic,
        is_open: true,
        reason: "open",
        next_open_utc: now + 60,
      };
    }
    return o;
  }, [rawStatuses, activeAsset, now]);
  const { data: newsData } = useSWR<NewsResponse>(
    api("/api/news"),
    newsFetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  const drift = useMemo(
    () =>
      computeDrift({
        proxies,
        quotes: quotesData?.quotes ?? {},
        statuses,
        nowSeconds: now,
      }),
    [proxies, quotesData, statuses, now],
  );

  // Push every snapshot into the in-memory history buffer for the charts.
  useEffect(() => {
    if (drift.points.length === 0) return;
    pushDriftSnapshot(drift.points, now);
  }, [drift.points, now, pushDriftSnapshot]);

  // Seed the chart history from /api/seed so the chart draws a real line
  // on first paint instead of waiting ~10 s for two live polls to land.
  // We replay computeDrift across each historical sample using the
  // current market status — close enough since seed samples are a few
  // minutes old, and the live polls overwrite anything that matters.
  useEffect(() => {
    if (!activeAsset || !seedData || seedData.samples.length === 0) return;
    const perSymbol: Record<string, DriftSample[]> = {};
    for (const sample of seedData.samples) {
      const res = computeDrift({
        proxies: activeAsset.proxies,
        quotes: sample.quotes,
        statuses,
        nowSeconds: sample.ts,
      });
      for (const p of res.points) {
        if (!Number.isFinite(p.implied_usd) && !Number.isFinite(p.drift_bps)) continue;
        (perSymbol[p.symbol] ??= []).push({
          ts: sample.ts,
          drift_bps: p.drift_bps,
          implied_usd: p.implied_usd,
        });
      }
    }
    seedDriftHistory(perSymbol);
  }, [activeAsset, seedData, statuses, seedDriftHistory]);

  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [newsVisible, setNewsVisible] = useState(true);
  useEffect(() => {
    const onResize = () =>
      setDims({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-black via-zinc-950 to-black">
      <Globe
        driftPoints={drift.points}
        statuses={statuses}
        newsArticles={newsData?.articles ?? []}
        followSun={followSun}
        is24_7={activeAsset?.trading_24_7 ?? false}
        width={dims.w}
        height={dims.h}
      />

      <AssetPicker
        universe={universeList}
        activeId={activeAssetId}
        onPick={setActiveAsset}
      />

      <DriftBadge points={drift.points} />

      <FollowIndexButton active={followSun} onToggle={toggleFollowSun} />

      {activeAsset?.display_mode === "big_chart" && (
        <BigPriceChart
          asset={activeAsset}
          points={drift.points}
          statuses={statuses}
        />
      )}
      <ChartsPanel
        points={drift.points}
        referenceSymbol={drift.reference_symbol}
        desktopHidden={activeAsset?.display_mode === "big_chart"}
      />

      <ProxyDetailPanel
        points={drift.points}
        statuses={statuses}
        referenceSymbol={drift.reference_symbol}
      />

      <NewsPanel />

      <button
        type="button"
        onClick={() => setMethodologyOpen(true)}
        className="hidden md:block absolute top-4 right-32 w-8 h-8 glass rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-100 z-10"
        title="How drift is measured + skeptical caveats"
        aria-label="open methodology"
      >
        ?
      </button>

      <MethodologyPanel
        open={methodologyOpen}
        onClose={() => setMethodologyOpen(false)}
      />

      <TickerButton
        universe={universeList}
        activeId={activeAssetId}
        onPick={setActiveAsset}
        followActive={followSun}
        onToggleFollow={toggleFollowSun}
      />

      <NewsRotator
        articles={newsData?.articles ?? []}
        visible={newsVisible}
        onClose={() => setNewsVisible(false)}
        onOpen={() => setNewsVisible(true)}
      />

      <Footer />
    </div>
  );
}
