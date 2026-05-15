import universeData from "./data/universe.json";
import exchangesData from "./data/exchanges.json";
import { getQuotes } from "./quotes";
import { getNews, refreshNewsCache } from "./news";

interface Env {
  QUOTE_PRIMARY?: string;
  CACHE_TTL_SECONDS?: string;
  TWELVE_DATA_KEY?: string;
  NEWS_KV: KVNamespace;
}

const ALLOWED_ORIGINS = new Set([
  "https://kylechoi101.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const DEFAULT_ORIGIN = "https://kylechoi101.github.io";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : DEFAULT_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=5",
      ...corsHeaders(req),
      ...(init.headers ?? {}),
    },
  });
}

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    const url = new URL(req.url);

    if (url.pathname === "/api/universe") {
      return json(req, universeData);
    }

    if (url.pathname === "/api/exchanges") {
      return json(req, exchangesData);
    }

    if (url.pathname === "/api/news") {
      const articles = await getNews(env, ctx);
      return json(
        req,
        {
          scope: "global",
          articles,
          fetched_at: Math.floor(Date.now() / 1000),
          attribution:
            "Headlines via GDELT Project (https://gdeltproject.org). Click through to original publishers for full content.",
        },
        {
          headers: {
            // Edge-cache for 5 min, serve stale up to 10 min while refreshing
            // in the background. Cloudflare's CDN honors this so subsequent
            // requests in the same region skip the GDELT round-trip entirely.
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          },
        },
      );
    }

    if (url.pathname === "/api/quotes") {
      const symbolsParam = url.searchParams.get("symbols") ?? "";
      const symbols = symbolsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (symbols.length === 0) {
        return json(req, { error: "missing ?symbols" }, { status: 400 });
      }
      if (symbols.length > 40) {
        return json(req, { error: "too many symbols (max 40)" }, { status: 400 });
      }
      const data = await getQuotes(symbols, env);
      return json(req, data);
    }

    if (url.pathname === "/" || url.pathname === "/api") {
      return json(req, {
        name: "globe-watch worker",
        endpoints: [
          "/api/universe",
          "/api/exchanges",
          "/api/quotes?symbols=SPY,1547.T",
          "/api/news?asset=SPX",
        ],
      });
    }

    return json(req, { error: "not found" }, { status: 404 });
  },

  /**
   * Cron Trigger — runs every 5 minutes per wrangler.toml.
   * Force-refreshes the KV news cache so user requests in every isolate
   * (not just the one the cron ran in) see warm data.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      refreshNewsCache(env).catch((err) => {
        console.warn("scheduled news refresh failed", err);
      }),
    );
  },
};
