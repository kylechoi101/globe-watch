# globe-watch

Live rotating-globe display of cross-market ETF proxy drift. The screen
shows, for a chosen asset (S&P 500 in the MVP), which exchanges are
currently open, what each market's proxy ETF is pricing as the implied
underlying, and the bps drift between them in real time. The globe is
shaded for sun position with NASA's Black Marble night texture, so the
night hemisphere shows city lights instead of a flat dark sphere.

Built as a companion to [time-lag-strategy](../time_lag_strategy/) —
the research pipeline that documented the proxy-decay mechanism this
display visualizes.

## What's interesting about it

- **NAV-normalized drift, not raw price comparison.** Each proxy has a
  per-fund scaling factor `k_i` that converts its local-currency price
  to an implied value of the underlying index. Drift is measured in bps
  vs an auto-selected reference proxy (whichever liquid candidate is
  currently in its main session). See `apps/web/src/lib/drift.ts`.
- **Day/night terminator with city lights.** Custom GLSL shader
  injected into the globe material. Sun position updates every 60s via
  `suncalc`. Textures from NASA Blue Marble + Black Marble.
- **No data storage.** The worker holds a 5-second TTL in-memory cache
  only; nothing is persisted. Reference data (universe, holidays) is
  bundled JSON.

## Architecture

```
Browser (React + react-globe.gl)
        │  polls /api/quotes every 5s via SWR
        ▼
Cloudflare Worker  (TypeScript)
   /api/universe   → bundled JSON (S&P 500 proxy map)
   /api/exchanges  → bundled JSON (session hours + holidays)
   /api/quotes     → Yahoo v8/finance/chart (parallel per-symbol)
                     Twelve Data fallback if QUOTE_PRIMARY=twelvedata
```

## Repo Layout

```
apps/
  web/      Vite + React + TS + Tailwind + react-globe.gl
  worker/   Cloudflare Worker (wrangler), Yahoo + Twelve Data adapters
packages/
  shared/   Cross-app TypeScript types
```

## Local dev

Requires Node 20+ and npm 10+.

```bash
npm install
npm run dev:worker   # http://localhost:8787
npm run dev:web      # http://localhost:5173  (proxies /api/* to worker)
```

Open http://localhost:5173 in a browser.

## Smoke checks

```bash
curl 'http://localhost:8787/api/universe'      | head -c 200
curl 'http://localhost:8787/api/exchanges'     | head -c 200
curl 'http://localhost:8787/api/quotes?symbols=SPY,1547.T,IVV.AX,CSPX.L,JPYUSD=X'
```

Verify the quote response has populated `quotes.SPY.price` and the FX
symbols. Initial drift values should be within a few bps across the
six proxies if the scaling factors are current.

## Quote providers

The worker defaults to Yahoo Finance via the v8 chart endpoint — no
API key required, public CORS-friendly. To use Twelve Data as primary
instead:

```bash
cd apps/worker
wrangler secret put TWELVE_DATA_KEY
# Edit wrangler.toml: QUOTE_PRIMARY = "twelvedata"
```

Yahoo remains as the automatic fallback if the primary call fails.

## Scaling factors

`apps/worker/src/data/universe.json` stores `scaling_k` per proxy:

```
implied_underlying_usd = (proxy_price_local / fx_to_usd) / scaling_k
```

The seed values in this repo are fitted to current spot at the time of
authoring (see `generated_at`). To refresh empirically over a 60-day
overlapping-hours OLS, add `scripts/fit_scaling_factors.ts` (planned
in Phase 4) — for now you can hand-compute from a fresh quote of each
proxy and `^GSPC`.

## Deployment

Cloudflare Pages + Workers:

```bash
cd apps/worker && npx wrangler deploy
cd ../web && npm run build && npx wrangler pages deploy dist
```

Point the web build's `/api/*` calls at the deployed worker URL by
setting `VITE_API_BASE` in `apps/web/.env.production`.

## Phased roadmap

Implemented (Phase 1 — MVP):
- [x] Globe with NASA day/night shader + soft terminator
- [x] Six S&P 500 proxies (SPY, VFV.TO, CSPX.L, CSPX.AS, 1547.T, IVV.AX)
- [x] NAV-normalized FX-adjusted drift in bps
- [x] Auto-selected reference proxy
- [x] Open-market detection (timezone + bundled holidays)
- [x] Clock HUD with next-open countdown + follow-the-sun toggle
- [x] Cloudflare Worker backend with TTL cache

Planned (see `../.claude/plans/this-gave-me-an-partitioned-lampson.md`):
- Phase 2 — USGS earthquakes + GDELT news layer
- Phase 3 — Holiday + central-bank rate-decision overlay
- Phase 4 — Multi-asset picker (Nasdaq, Nikkei, KOSPI, gold, oil, BTC)

## License

CC BY-NC-SA 4.0 — same as the parent `time_lag_strategy` repo. See
`LICENSE`.
