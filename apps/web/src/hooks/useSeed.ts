import useSWR from "swr";
import type { SeedResponse } from "@globe-watch/shared";
import { api } from "../lib/api";

const fetcher = async (url: string): Promise<SeedResponse | null> => {
  const r = await fetch(url);
  // 404 = no seed yet for this asset (cron hasn't warmed it). Treat as
  // "no seed available" rather than throwing — the chart can still come
  // up via the live polling path.
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`seed ${r.status}`);
  return r.json() as Promise<SeedResponse>;
};

export function useSeed(assetId: string | null) {
  // One-shot. Don't refresh — the live polling fills the chart from
  // there. Re-running the seed fetch later would just duplicate work
  // already covered by /api/quotes.
  return useSWR<SeedResponse | null>(
    assetId ? api(`/api/seed?asset=${encodeURIComponent(assetId)}`) : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
    },
  );
}
