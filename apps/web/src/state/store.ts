import { create } from "zustand";
import type { AssetUniverseEntry, DriftPoint } from "@globe-watch/shared";

export interface DriftSample {
  ts: number;        // unix seconds
  drift_bps: number; // NaN if missing
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
        const updated = existing.concat({ ts, drift_bps: p.drift_bps });
        if (updated.length > HISTORY_LIMIT) updated.splice(0, updated.length - HISTORY_LIMIT);
        next[p.symbol] = updated;
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
