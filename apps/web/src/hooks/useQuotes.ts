import useSWR from "swr";
import type { QuotesResponse } from "@globe-watch/shared";
import { api } from "../lib/api";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    return r.json() as Promise<QuotesResponse>;
  });

export function useQuotes(symbols: string[], refreshIntervalMs = 5000) {
  const key =
    symbols.length === 0
      ? null
      : api(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
  return useSWR<QuotesResponse>(key, fetcher, {
    refreshInterval: refreshIntervalMs,
    revalidateOnFocus: false,
    dedupingInterval: 1500,
    keepPreviousData: true,
  });
}
