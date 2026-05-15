export interface Proxy {
  symbol: string;          // yahoo-style symbol, e.g. "SPY", "1547.T"
  name: string;            // human-readable label
  country: string;         // ISO 3166-1 alpha-2
  city: string;            // primary listing city
  lat: number;
  lon: number;
  exchange_mic: string;    // ISO 10383 MIC, e.g. "XNYS", "XTKS"
  currency: string;        // ISO 4217, e.g. "USD", "JPY"
  fx_symbol: string;       // yahoo FX symbol for local->USD, "" if already USD
  scaling_k: number;       // proxy_price_usd / underlying_index_value
  is_reference_candidate: boolean;
}

export interface AssetUniverseEntry {
  asset_id: string;        // "SPX", "GOLD", "BTC"
  display_name: string;
  underlying_symbol: string; // yahoo, e.g. "^GSPC"
  trading_24_7: boolean;
  /** "cards" (default) → 10 mini cards on the right.
   *  "big_chart"        → single overlay chart of per-unit price, all venues. */
  display_mode?: "cards" | "big_chart";
  /** Human label for the per-unit y-axis ("BTC", "g"). */
  display_unit?: string;
  /** Convert implied_USD (per underlying-index unit) to display units.
   *  e.g. gold's GC=F is USD per troy ounce; divisor 31.1035 → USD per gram. */
  display_divisor?: number;
  proxies: Proxy[];
}

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  ts: number;              // unix seconds
  session: "regular" | "pre" | "post" | "closed";
}

export interface QuotesResponse {
  quotes: Record<string, Quote>;
  fetched_at: number;
  cache_age_seconds: number;
}

export interface ExchangeMeta {
  mic: string;
  name: string;
  timezone: string;
  regular_open: string;     // "HH:MM" local
  regular_close: string;    // "HH:MM" local
  holidays: string[];       // ISO dates "YYYY-MM-DD"
  early_closes: { date: string; close: string }[];
}

export type OpenReason =
  | "open"
  | "closed_weekend"
  | "closed_holiday"
  | "closed_after_hours"
  | "closed_pre_hours";

export interface MarketStatus {
  mic: string;
  is_open: boolean;
  reason: OpenReason;
  holiday_name?: string;
  next_open_utc: number;   // unix seconds
}

export interface DriftPoint {
  symbol: string;
  proxy: Proxy;
  price_local: number;
  fx_to_usd: number;
  implied_usd: number;
  drift_bps: number;
  staleness_seconds: number;
  is_reference: boolean;
}

export interface NewsArticle {
  url: string;
  title: string;
  domain: string;
  source_country: string;
  language: string;
  seen_at: number;
  lat: number | null;
  lon: number | null;
}

export interface NewsResponse {
  scope: string;            // "global" — single feed, not asset-specific
  articles: NewsArticle[];
  fetched_at: number;
  attribution: string;
}
