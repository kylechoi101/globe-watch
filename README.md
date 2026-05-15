# globe-watch

> **Live at https://kylechoi101.github.io/globe-watch/**

A rotating-globe display of how the same security gets priced
simultaneously around the world. Pick an asset (S&P 500, Nasdaq,
Nikkei, FTSE, DAX, Hang Seng, ASX 200, Euro Stoxx, gold, bitcoin,
MSCI EM); watch each venue's implied price in USD, the drift between
them in basis points, and a global news ticker pinned to where each
story is actually happening — all on a NASA-textured globe with the
day/night terminator anchored to real sun position.

## Why this exists

Markets don't actually close. When New York rings the bell at 4 PM ET,
capital doesn't go to sleep — it just changes hands. London is eight
hours into its day. Tokyo is about to open. The S&P 500 stops printing
prices in the form most US retail investors recognize, but the *idea*
of the S&P 500 keeps trading the entire night, in proxy ETFs in
Toronto, London, Frankfurt, Tokyo, Hong Kong, Sydney. Every venue is
voting on what the underlying is worth, in their own currency, with
whatever they know in their session — earnings, central-bank actions,
geopolitics, an OPEC announcement, an election. The drift between
those simultaneous prices is the visible footprint of how information
propagates around a planet that never stops trading. Most market
dashboards bury that completely; this one makes it the centerpiece.

The visual is a literal rotating globe with NASA's day/night terminator
sweeping across it: lit hemisphere shows daytime, dark side glows with
real city lights from Black Marble. Dots mark every venue, green when
their exchange is open, dim when closed — and as Earth turns you
watch the trading baton pass: NY → Sydney → Tokyo → Frankfurt →
London → NY. A live news ticker pulls global macro headlines from
GDELT, parses each one for the place it's actually about (a Reuters
story about Tokyo gets pinned to Tokyo, not London), and clicking a
headline flies the camera to that pin and shows the title right on the
dot. Switch the dropdown and the same story plays out for Bitcoin (10
fiat venues, 24/7, kimchi premium visible in real time), gold (10
ETF wrappers across 8 cities, NAV drifts between them), or any of the
other equity indexes.

Built as a companion to
[time-lag-strategy](https://github.com/kylechoi101/time-lag-strategy),
the research pipeline that documented the proxy-decay mechanism this
display visualizes.

## What's interesting under the hood

- **NAV-normalized drift, not raw price comparison.** Each venue has
  an empirically-fit scaling factor `kᵢ` that converts its
  local-currency price to an implied USD value of the underlying.
  Drift is `(implied_i − implied_ref) / implied_ref` in bps. See
  `apps/web/src/lib/drift.ts`.
- **FX precision repair.** Yahoo truncates low-magnitude direct pairs
  (`KRWUSD=X = 0.0007` instead of the real `0.000670` — 4% error,
  ~400 bps phantom drift). The drift library auto-detects symbol
  orientation and uses `USDXXX=X` (with inversion) when the direct
  pair is too coarse.
- **Day/night terminator with city lights.** Custom GLSL shader on
  the globe material. Sun direction computed from a NOAA mean-sun
  formula (declination + RA − GMST), normals transformed by the model
  matrix so lighting stays anchored to the planet (not the camera) as
  you orbit.
- **Headline-first geo pinning.** News pins use the place mentioned
  in the headline — countries, cities, "Wall Street", "ECB", "the Fed"
  — only falling back to the publisher's source country when the
  headline is locationless. Wire-service duplicates folded by
  normalized title prefix.
- **24/7 spot mode for Bitcoin.** Bitcoin uses 10 spot fiat pairs
  (BTC-USD/EUR/GBP/JPY/AUD/CAD/KRW/CNY/INR/RUB) instead of ETF
  wrappers — direct cross-currency disagreement, no NAV premium in
  the way. All venues stay "live" since BTC never closes.
- **Big-chart mode for global commodities.** Gold and Bitcoin show
  one large per-unit price chart (USD/g for gold, USD/BTC for
  bitcoin) overlaying all 10 venues. The visible line spread is the
  drift, but the eye reads the absolute price level.
- **No data storage.** Worker uses a 5-second TTL in-memory cache
  only; nothing is persisted. Reference data (universe, exchanges,
  places) is bundled JSON.

## Architecture

```
Browser (React + react-globe.gl + custom GLSL)
        │  polls /api/quotes every 5s via SWR
        │  polls /api/news every 5min
        ▼
Cloudflare Worker  (TypeScript)
   /api/universe   → bundled JSON: 11 assets × 26 ETF venues + 10 BTC fiats
   /api/exchanges  → bundled JSON: session hours, holidays per MIC
   /api/quotes     → Yahoo v8/finance/chart, parallel per-symbol, 5s cache
   /api/news       → GDELT 2.0 Doc API, global macro feed, 5min cache,
                     headline-first geo enrichment, wire-service dedup
```

## Repo layout

```
apps/
  web/      Vite + React + TS + Tailwind + react-globe.gl + GLSL shader
  worker/   Cloudflare Worker (wrangler), Yahoo + GDELT adapters
packages/
  shared/   Cross-app TypeScript types
.github/workflows/deploy-pages.yml  Auto-deploy to GitHub Pages on push
```

## Local dev

Requires Node 20+ and npm 10+.

```bash
npm install
npm run dev:worker   # http://localhost:8787
npm run dev:web      # http://localhost:5173 (proxies /api/* to worker)
```

Open http://localhost:5173.

## Deployment

Frontend → GitHub Pages, backend → Cloudflare Workers. Both free.

```bash
# Backend
cd apps/worker && npx wrangler deploy

# Frontend (auto-builds on push to main via .github/workflows/deploy-pages.yml)
git push
```

The workflow reads `VITE_API_BASE` from a GitHub Actions repo variable
(Settings → Secrets and variables → Actions → Variables) and bakes the
worker URL into the build.

## Methodology

Detailed math, skeptical caveats, and data-source disclosure live
inside the app — click the **?** button at the top-right. Covers:
implied-USD computation, scaling factors and their decay, reference
selection, FX timing artifacts, NAV premia, day/night shader, news
sourcing, and what-this-is-vs-isn't.

## Data sources

- **Quotes** — Yahoo Finance v8 chart endpoint (undocumented public API).
- **News** — [GDELT Project](https://gdeltproject.org), free
  research/non-commercial use; we cache 5 min server-side and only
  display headline + source domain + timestamp.
- **Globe textures** — NASA Visible Earth (Blue Marble + Black Marble).

## License

CC BY-NC-SA 4.0 — attribution required, non-commercial, share-alike.
See [LICENSE](LICENSE).
