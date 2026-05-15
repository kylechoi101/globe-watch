import type {
  Proxy,
  Quote,
  DriftPoint,
  MarketStatus,
} from "@globe-watch/shared";

export interface DriftInputs {
  proxies: Proxy[];
  quotes: Record<string, Quote>;
  statuses: Record<string, MarketStatus>;
  nowSeconds: number;
}

export interface DriftResult {
  reference_symbol: string | null;
  points: DriftPoint[];
}

/**
 * Reference priority: candidates that are open right now, ordered by
 * the order they appear in universe.json (which we author US → EU → Asia).
 * Falls back to the freshest candidate quote if none are currently open.
 */
function pickReference(
  candidates: Proxy[],
  quotes: Record<string, Quote>,
  statuses: Record<string, MarketStatus>,
): Proxy | null {
  const openOne = candidates.find((p) => statuses[p.exchange_mic]?.is_open);
  if (openOne && quotes[openOne.symbol]) return openOne;

  let best: { proxy: Proxy; ts: number } | null = null;
  for (const p of candidates) {
    const q = quotes[p.symbol];
    if (!q) continue;
    if (!best || q.ts > best.ts) best = { proxy: p, ts: q.ts };
  }
  return best?.proxy ?? null;
}

/**
 * Read an FX quote as "USD per 1 unit of the proxy's local currency".
 *
 * Convention by symbol orientation:
 *   - "XXXUSD=X" → quote already gives USD per XXX, return as-is.
 *   - "USDXXX=X" → quote gives XXX per USD, return 1/price.
 *
 * Yahoo truncates many of the LOW-VALUE-direct pairs (KRWUSD=X = 0.0007,
 * truncating the real ~0.000670 and producing ~4% phantom drift). For
 * those currencies the universe.json deliberately specifies the
 * USD-prefixed pair instead. The fallback to the opposite pair is still
 * here as a defensive belt-and-suspenders.
 */
function fxFromQuotes(
  fx_symbol: string,
  quotes: Record<string, Quote>,
): number {
  if (!fx_symbol) return 1;
  const q = quotes[fx_symbol];
  if (q && q.price > 0) return rateAsUsdPerLocal(fx_symbol, q.price);

  // Try the opposite pair.
  const root = fx_symbol.replace("=X", "");
  if (root.length === 6) {
    const flipped = root.slice(3, 6) + root.slice(0, 3) + "=X";
    const f = quotes[flipped];
    if (f && f.price > 0) return rateAsUsdPerLocal(flipped, f.price);
  }
  return NaN;
}

function rateAsUsdPerLocal(symbol: string, raw: number): number {
  const root = symbol.replace("=X", "");
  if (root.length !== 6) return raw;
  if (root.endsWith("USD")) return raw;          // XXXUSD=X
  if (root.startsWith("USD")) return 1 / raw;    // USDXXX=X
  return raw;
}

function impliedUsd(proxy: Proxy, quote: Quote, fx: number): number {
  if (!Number.isFinite(quote.price) || !Number.isFinite(fx) || proxy.scaling_k <= 0) {
    return NaN;
  }
  const usd_price = quote.price * fx;
  return usd_price / proxy.scaling_k;
}

export function computeDrift(input: DriftInputs): DriftResult {
  const { proxies, quotes, statuses, nowSeconds } = input;
  const candidates = proxies.filter((p) => p.is_reference_candidate);
  const ref = pickReference(
    candidates.length ? candidates : proxies,
    quotes,
    statuses,
  );
  if (!ref) return { reference_symbol: null, points: [] };

  const refQuote = quotes[ref.symbol];
  const refFx = fxFromQuotes(ref.fx_symbol, quotes);
  const refImplied = refQuote ? impliedUsd(ref, refQuote, refFx) : NaN;

  const points: DriftPoint[] = proxies.map((p) => {
    const q = quotes[p.symbol];
    const fx = fxFromQuotes(p.fx_symbol, quotes);
    const implied_usd = q ? impliedUsd(p, q, fx) : NaN;
    const drift_bps =
      Number.isFinite(implied_usd) && Number.isFinite(refImplied) && refImplied !== 0
        ? 10_000 * (implied_usd - refImplied) / refImplied
        : NaN;
    const staleness_seconds = q ? Math.max(0, nowSeconds - q.ts) : Infinity;
    return {
      symbol: p.symbol,
      proxy: p,
      price_local: q ? q.price : NaN,
      fx_to_usd: fx,
      implied_usd,
      drift_bps,
      staleness_seconds,
      is_reference: p.symbol === ref.symbol,
    };
  });

  return { reference_symbol: ref.symbol, points };
}

export function driftColor(bps: number): string {
  if (!Number.isFinite(bps)) return "#6b7280"; // gray for missing
  // Clip to ±50 bps for liquid proxies' typical range.
  const clipped = Math.max(-50, Math.min(50, bps));
  const t = (clipped + 50) / 100;
  // Diverging red→white→green; never pure white so the dot stays visible
  // on the lit hemisphere.
  if (t < 0.5) {
    const k = t / 0.5;
    return rgb(220 * (1 - k) + 200 * k, 80 * (1 - k) + 200 * k, 80 * (1 - k) + 200 * k);
  }
  const k = (t - 0.5) / 0.5;
  return rgb(200 * (1 - k) + 60 * k, 200 * (1 - k) + 220 * k, 200 * (1 - k) + 80 * k);
}

function rgb(r: number, g: number, b: number): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
