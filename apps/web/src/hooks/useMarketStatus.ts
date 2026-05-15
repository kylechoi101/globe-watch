import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { ExchangeMeta, MarketStatus } from "@globe-watch/shared";
import { computeStatus } from "../lib/sessions";
import { api } from "../lib/api";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<{ exchanges: ExchangeMeta[] }>);

export function useMarketStatuses(): {
  statuses: Record<string, MarketStatus>;
  exchanges: ExchangeMeta[];
  now: number;
} {
  const { data } = useSWR(api("/api/exchanges"), fetcher, {
    revalidateOnFocus: false,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const exchanges = data?.exchanges ?? [];
  const statuses = useMemo(() => {
    const m: Record<string, MarketStatus> = {};
    for (const ex of exchanges) m[ex.mic] = computeStatus(ex, now);
    return m;
  }, [exchanges, now]);

  return { statuses, exchanges, now: Math.floor(now / 1000) };
}
