import type { Quote, QuotesResponse } from "@globe-watch/shared";
import { cacheGet, cacheSet } from "./cache";

const CACHE_TTL = 5;

interface YahooChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
  currency?: string;
  marketState?: string;
}

interface YahooChartResponse {
  chart: {
    result: { meta: YahooChartMeta }[] | null;
    error: unknown;
  };
}

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchYahooOne(symbol: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1m&range=1d`;
  let res: Response;
  try {
    res = await fetch(url, { headers: YAHOO_HEADERS });
  } catch (e) {
    console.warn("yahoo fetch failed", symbol, e);
    return null;
  }
  if (!res.ok) {
    console.warn("yahoo non-ok", symbol, res.status);
    return null;
  }
  let data: YahooChartResponse;
  try {
    data = (await res.json()) as YahooChartResponse;
  } catch {
    return null;
  }
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice === undefined) return null;
  let price = meta.regularMarketPrice;
  let currency = meta.currency ?? "USD";
  // London Stock Exchange quotes most ETFs in pence (GBp / GBX). Normalize
  // to GBP so downstream FX math uses GBPUSD without surprise factor-of-100s.
  if (currency === "GBp" || currency === "GBX") {
    price = price / 100;
    currency = "GBP";
  }
  return {
    symbol,
    price,
    currency,
    ts: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
    session: sessionFromYahoo(meta.marketState),
  };
}

/**
 * Exported so the cron seed refresher can hit Yahoo directly without
 * routing through the read-through cache (cron is a fresh isolate; the
 * in-memory cache is empty for it anyway).
 */
export async function fetchYahoo(symbols: string[]): Promise<Record<string, Quote>> {
  const results = await Promise.all(symbols.map((s) => fetchYahooOne(s)));
  const out: Record<string, Quote> = {};
  for (const q of results) if (q) out[q.symbol] = q;
  return out;
}

/**
 * Same as fetchYahoo but processes symbols in sequential chunks with a
 * small inter-chunk delay. The live /api/quotes path asks for ~15
 * symbols at a time and works fine; the cron seed refresher asks for
 * ~50 at once and Yahoo silently drops some (BTC venues consistently
 * came back empty). Chunked-sequential matches the live shape and
 * keeps total wall time under a couple of seconds.
 */
export async function fetchYahooChunked(
  symbols: string[],
  chunkSize = 12,
  delayMs = 250,
): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const partial = await fetchYahoo(chunk);
    Object.assign(out, partial);
    if (i + chunkSize < symbols.length && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return out;
}

function sessionFromYahoo(state: string | undefined): Quote["session"] {
  switch (state) {
    case "REGULAR":
      return "regular";
    case "PRE":
      return "pre";
    case "POST":
    case "POSTPOST":
      return "post";
    default:
      return "closed";
  }
}

interface TwelveDataQuote {
  symbol: string;
  close?: string;
  price?: string;
  currency?: string;
  timestamp?: number;
  is_market_open?: boolean;
}

async function fetchTwelveData(
  symbols: string[],
  apiKey: string,
): Promise<Record<string, Quote>> {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
    symbols.join(","),
  )}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`twelvedata ${res.status}`);
  const data = (await res.json()) as
    | TwelveDataQuote
    | Record<string, TwelveDataQuote>;
  const out: Record<string, Quote> = {};
  const items: TwelveDataQuote[] = Array.isArray(data)
    ? (data as TwelveDataQuote[])
    : "symbol" in (data as TwelveDataQuote)
      ? [data as TwelveDataQuote]
      : Object.values(data as Record<string, TwelveDataQuote>);
  for (const q of items) {
    if (!q.symbol) continue;
    const price = q.close ? Number(q.close) : q.price ? Number(q.price) : NaN;
    if (!Number.isFinite(price)) continue;
    out[q.symbol] = {
      symbol: q.symbol,
      price,
      currency: q.currency ?? "USD",
      ts: q.timestamp ?? Math.floor(Date.now() / 1000),
      session: q.is_market_open ? "regular" : "closed",
    };
  }
  return out;
}

export async function getQuotes(
  symbols: string[],
  env: { QUOTE_PRIMARY?: string; TWELVE_DATA_KEY?: string },
): Promise<QuotesResponse> {
  const sorted = [...new Set(symbols)].sort();
  const cacheKey = `quotes:${sorted.join(",")}`;
  const cached = cacheGet<QuotesResponse>(cacheKey);
  if (cached) {
    const age = Math.floor((Date.now() / 1000) - cached.fetched_at);
    return { ...cached, cache_age_seconds: age };
  }

  let quotes: Record<string, Quote> = {};
  const primary = env.QUOTE_PRIMARY ?? "yahoo";
  const tryTwelve = primary === "twelvedata" && env.TWELVE_DATA_KEY;

  try {
    quotes = tryTwelve
      ? await fetchTwelveData(sorted, env.TWELVE_DATA_KEY!)
      : await fetchYahoo(sorted);
  } catch (err) {
    // Fall through to the other provider.
    try {
      quotes = tryTwelve
        ? await fetchYahoo(sorted)
        : env.TWELVE_DATA_KEY
          ? await fetchTwelveData(sorted, env.TWELVE_DATA_KEY)
          : {};
    } catch (err2) {
      console.error("both providers failed", err, err2);
    }
  }

  const response: QuotesResponse = {
    quotes,
    fetched_at: Math.floor(Date.now() / 1000),
    cache_age_seconds: 0,
  };
  cacheSet(cacheKey, response, CACHE_TTL);
  return response;
}
