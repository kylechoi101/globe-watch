import type {
  Quote,
  SeedResponse,
  SeedSample,
} from "@globe-watch/shared";
import universeData from "./data/universe.json";
import { fetchYahoo } from "./quotes";

// Most-recent N quote snapshots we keep per asset. ~8 is enough to draw
// a recognizable chart line on first paint without bloating KV — at 1
// sample / 5 min that's ~40 minutes of history shown immediately on
// load.
const RING_SIZE = 8;
// All assets' rings live under one KV value. This matters because KV on
// the Workers free tier is capped at 1000 writes/day: writing per-asset
// would be 11 writes/cron-tick which doesn't fit. Combined = 1 write.
const KEY = "seed:v1:all";

interface UniverseProxy {
  symbol: string;
  fx_symbol: string;
}
interface UniverseAsset {
  asset_id: string;
  proxies: UniverseProxy[];
}
interface UniverseData {
  assets: UniverseAsset[];
}

interface CombinedSeed {
  // Each ring is sorted oldest→newest. New ticks are appended; the
  // oldest is dropped once length exceeds RING_SIZE.
  rings: Record<string, SeedSample[]>;
  updated_at: number;
}

export interface SeedEnv {
  NEWS_KV?: KVNamespace;
  CACHE_KV?: KVNamespace;
  QUOTE_PRIMARY?: string;
  TWELVE_DATA_KEY?: string;
}

function kvBinding(env: SeedEnv): KVNamespace | undefined {
  return env.CACHE_KV ?? env.NEWS_KV;
}

/**
 * Build the same symbol list the frontend will request for an asset.
 * Keep this in sync with apps/web/src/App.tsx — proxies + their FX pair
 * and the defensive opposite-direction FX pair Yahoo sometimes prefers.
 */
function symbolsForAsset(asset: UniverseAsset): string[] {
  const out = new Set<string>();
  for (const p of asset.proxies) {
    out.add(p.symbol);
    if (p.fx_symbol) {
      out.add(p.fx_symbol);
      const root = p.fx_symbol.replace("=X", "");
      if (root.length === 6) {
        out.add(root.slice(3, 6) + root.slice(0, 3) + "=X");
      }
    }
  }
  return [...out];
}

async function readCombined(env: SeedEnv): Promise<CombinedSeed | null> {
  const kv = kvBinding(env);
  if (!kv) return null;
  try {
    return await kv.get<CombinedSeed>(KEY, "json");
  } catch (err) {
    console.warn("seed kv read failed", err);
    return null;
  }
}

export async function getSeed(
  env: SeedEnv,
  assetId: string,
): Promise<SeedResponse | null> {
  const combined = await readCombined(env);
  if (!combined) return null;
  const ring = combined.rings[assetId];
  if (!ring || ring.length === 0) return null;
  return {
    asset_id: assetId,
    samples: ring,
    fetched_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Cron-side: fetch a fresh quote snapshot for every asset and append
 * each to its ring. One combined KV write per tick keeps the daily
 * write count well under the free-tier 1000/day cap (288 ticks/day at
 * the 5-min cron schedule).
 *
 * Per-asset failures don't bubble — one bad Yahoo response shouldn't
 * starve every other asset's seed.
 */
export async function refreshQuoteSeeds(env: SeedEnv): Promise<void> {
  const kv = kvBinding(env);
  if (!kv) return;
  const universe = universeData as UniverseData;
  const prior = (await readCombined(env)) ?? { rings: {}, updated_at: 0 };

  const fetchedAt = Math.floor(Date.now() / 1000);
  await Promise.all(
    universe.assets.map(async (asset) => {
      const symbols = symbolsForAsset(asset);
      if (symbols.length === 0) return;
      let quotes: Record<string, Quote>;
      try {
        quotes = await fetchYahoo(symbols);
      } catch (err) {
        console.warn("seed: fetch failed for", asset.asset_id, err);
        return;
      }
      if (Object.keys(quotes).length === 0) return;

      const sample: SeedSample = { ts: fetchedAt, quotes };
      const existing = prior.rings[asset.asset_id] ?? [];
      const last = existing[existing.length - 1];
      // Skip duplicate ts in case two crons fired in the same second.
      if (last && last.ts === sample.ts) return;
      const next = existing.concat(sample);
      if (next.length > RING_SIZE) next.splice(0, next.length - RING_SIZE);
      prior.rings[asset.asset_id] = next;
    }),
  );
  prior.updated_at = fetchedAt;

  try {
    await kv.put(KEY, JSON.stringify(prior));
  } catch (err) {
    console.warn("seed: kv put failed", err);
  }
}
