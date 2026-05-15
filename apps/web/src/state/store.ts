import { create } from "zustand";
import type { AssetUniverseEntry, DriftPoint } from "@globe-watch/shared";

export interface DriftSample {
  ts: number;          // unix seconds
  drift_bps: number;   // NaN if missing
  implied_usd: number; // per underlying-index unit; NaN if missing
}

const HISTORY_LIMIT = 240; // ~20 minutes at 5-second polling

interface AppState {
  universe: AssetUniverseEntry[];
  activeAssetId: string;
  setUniverse: (u: AssetUniverseEntry[]) => void;
  setActiveAsset: (id: string) => void;
  followSun: boolean;
  toggleFollowSun: () => void;

  /** per-symbol rolling history. lives only in memory. */
  history: Record<string, DriftSample[]>;
  pushDriftSnapshot: (points: DriftPoint[], ts: number) => void;
  /**
   * Seed history from the worker's /api/seed ring buffer. Only fills
   * gaps before the first live sample lands — never overwrites samples
   * we've already collected ourselves, so the live chart isn't disturbed
   * if the user lingers and the seed is refetched later.
   */
  seedDriftHistory: (
    perSymbol: Record<string, DriftSample[]>,
  ) => void;

  activeChartTab: string; // "ALL" or a proxy symbol
  setActiveChartTab: (tab: string) => void;

  hoveredSymbol: string | null;
  setHoveredSymbol: (s: string | null) => void;

  cameraTarget: { lat: number; lng: number; ts: number } | null;
  flyTo: (lat: number, lng: number) => void;

  selectedArticleUrl: string | null;
  selectArticle: (url: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  universe: [],
  activeAssetId: "SPX",
  setUniverse: (universe) => set({ universe }),
  // Switching assets resets the per-symbol drift history so we don't mix
  // SPX-era samples into a Nasdaq chart, and clears any selected article so
  // its callout doesn't linger on the new globe.
  setActiveAsset: (id) =>
    set((s) => ({
      activeAssetId: id,
      history: s.activeAssetId === id ? s.history : {},
      selectedArticleUrl: null,
    })),
  followSun: false,
  toggleFollowSun: () => set((s) => ({ followSun: !s.followSun })),

  history: {},
  pushDriftSnapshot: (points, ts) =>
    set((state) => {
      const next: Record<string, DriftSample[]> = { ...state.history };
      for (const p of points) {
        const existing = next[p.symbol] ?? [];
        const last = existing[existing.length - 1];
        // Skip if we already recorded a sample at this exact timestamp.
        if (last && last.ts === ts) continue;
        const updated = existing.concat({
          ts,
          drift_bps: p.drift_bps,
          implied_usd: p.implied_usd,
        });
        if (updated.length > HISTORY_LIMIT) updated.splice(0, updated.length - HISTORY_LIMIT);
        next[p.symbol] = updated;
      }
      return { history: next };
    }),
  seedDriftHistory: (perSymbol) =>
    set((state) => {
      const next: Record<string, DriftSample[]> = { ...state.history };
      for (const [symbol, seeded] of Object.entries(perSymbol)) {
        if (!seeded || seeded.length === 0) continue;
        const existing = next[symbol] ?? [];
        // Drop seeded samples that are at-or-newer than any live sample
        // we already have, so seeding never rewrites the live tail.
        const oldestLive = existing[0]?.ts ?? Infinity;
        const fresh = seeded.filter((s) => s.ts < oldestLive);
        if (fresh.length === 0) continue;
        // Sort just to be safe — KV preserves order but the wire shape
        // is whatever cron last wrote.
        const merged = fresh.concat(existing).sort((a, b) => a.ts - b.ts);
        if (merged.length > HISTORY_LIMIT) {
          merged.splice(0, merged.length - HISTORY_LIMIT);
        }
        next[symbol] = merged;
      }
      return { history: next };
    }),

  activeChartTab: "ALL",
  setActiveChartTab: (tab) => set({ activeChartTab: tab }),

  hoveredSymbol: null,
  setHoveredSymbol: (s) => set({ hoveredSymbol: s }),

  cameraTarget: null,
  flyTo: (lat, lng) => set({ cameraTarget: { lat, lng, ts: Date.now() } }),

  selectedArticleUrl: null,
  selectArticle: (url) => set({ selectedArticleUrl: url }),
}));

export function selectActiveAsset(state: AppState): AssetUniverseEntry | null {
  return state.universe.find((a) => a.asset_id === state.activeAssetId) ?? null;
}
