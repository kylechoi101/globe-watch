import universeData from "./data/universe.json";
import exchangesData from "./data/exchanges.json";
import { getQuotes } from "./quotes";
import { getNews } from "./news";

interface Env {
  QUOTE_PRIMARY?: string;
  CACHE_TTL_SECONDS?: string;
  TWELVE_DATA_KEY?: string;
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
  async fetch(req: Request, env: Env): Promise<Response> {
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
      const articles = await getNews();
      return json(req, {
        scope: "global",
        articles,
        fetched_at: Math.floor(Date.now() / 1000),
        attribution:
          "Headlines via GDELT Project (https://gdeltproject.org). Click through to original publishers for full content.",
      });
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
};
