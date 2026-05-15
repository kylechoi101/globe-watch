import { cacheGet, cacheSet } from "./cache";
import countryCentroids from "./data/countries.json";
import placeList from "./data/places.json";

const CACHE_TTL = 300; // 5 minutes — well above GDELT's 1-per-5s suggestion.
const MAX_ARTICLES = 10;

const CENTROIDS = countryCentroids as unknown as Record<string, unknown>;

interface Place {
  name: string;
  lat: number;
  lon: number;
}

// Sort once at module load: longest names first so "New York" wins before
// any later substring like "York".
const PLACES: Place[] = (placeList as Place[])
  .slice()
  .sort((a, b) => b.name.length - a.name.length);

function lookupCentroid(country: string): [number, number] | null {
  const v = CENTROIDS[country];
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number") {
    return [v[0], v[1]];
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scan the headline for a place name. Returns the longest match — sorted
 * once at module load to keep the per-article cost low. Matches respect
 * word boundaries to avoid e.g. matching "Iran" inside "Iranian" or
 * "Korea" inside "Koreans".
 */
function extractLocation(title: string): Place | null {
  if (!title) return null;
  for (const p of PLACES) {
    const re = new RegExp(`\\b${escapeRegex(p.name)}\\b`, "i");
    if (re.test(title)) return p;
  }
  return null;
}

/**
 * Normalize a title into a short hash-friendly key so wire-service stories
 * carried by many outlets fold into a single entry. We keep the first 70
 * alphanumeric chars, lowercased.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

export interface NewsArticle {
  url: string;
  title: string;
  domain: string;
  source_country: string;
  language: string;
  seen_at: number; // unix seconds
  lat: number | null;
  lon: number | null;
}

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

/**
 * Per-asset query. Keep it short and high-signal: GDELT scores relevance,
 * and overly broad queries (e.g. "stock") flood with low-quality output.
 */
/**
 * One global feed — drivers that move every asset. No more per-asset
 * keyword filtering: the picker switches the underlying you're watching,
 * the news stream is the same world the assets all live in.
 *
 * GDELT rejects single-word and short phrases ("war", "OPEC") with
 * "phrase too short". Use multi-word phrases throughout.
 */
const GLOBAL_QUERY =
  '("Federal Reserve" OR "central bank" OR "interest rates" OR "inflation report" OR "global markets" OR "election results" OR "trade tariffs" OR "OPEC meeting" OR "geopolitical tensions" OR "economic outlook")';

/**
 * GDELT titles occasionally contain stray spaces between digits and
 * punctuation (e.g. "5 . 55B", "50 , 000"). Normalize for display.
 */
function cleanTitle(t: string): string {
  return t
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseSeenDate(s: string): number {
  // GDELT format: YYYYMMDDTHHMMSSZ
  if (!s || s.length < 15) return Math.floor(Date.now() / 1000);
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  const h = Number(s.slice(9, 11));
  const mi = Number(s.slice(11, 13));
  const se = Number(s.slice(13, 15));
  return Math.floor(Date.UTC(y, mo, d, h, mi, se) / 1000);
}

export async function getNews(): Promise<NewsArticle[]> {
  const cacheKey = "news:global";
  const cached = cacheGet<NewsArticle[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    query: GLOBAL_QUERY,
    mode: "ArtList",
    format: "json",
    maxrecords: "30", // wider net before dedup; we keep top 10 after
    sort: "DateDesc",
    timespan: "24h",
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

  let articles: NewsArticle[] = [];
  let ok = false;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "globe-watch/0.1 (https://github.com/kylechoi101/globe-watch; research)",
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn("gdelt non-ok", res.status, text.slice(0, 200));
    } else {
      try {
        const data = JSON.parse(text) as GdeltResponse;
        const enriched = (data.articles ?? [])
          .filter((a) => a.title && a.url && (a.language ?? "") === "English")
          .map((a) => {
            const title = cleanTitle(a.title);
            const country = a.sourcecountry ?? "";

            // 1) Place mentioned in the headline beats the publisher's
            //    country. "Yen drops after BOJ holds" pinned to Tokyo even
            //    if Reuters London reported it.
            const fromTitle = extractLocation(title);
            // 2) Source-country centroid as the fallback anchor.
            const fallback = lookupCentroid(country);
            const coords =
              fromTitle != null
                ? [fromTitle.lat, fromTitle.lon]
                : fallback != null
                  ? fallback
                  : null;

            return {
              url: a.url,
              title,
              domain: a.domain,
              source_country: country,
              language: a.language ?? "",
              seen_at: parseSeenDate(a.seendate),
              lat: coords ? coords[0] : null,
              lon: coords ? coords[1] : null,
            };
          });

        // 3) Dedup wire-service repeats. Group by normalized title prefix;
        //    keep the freshest entry per group.
        const groups = new Map<string, typeof enriched[number]>();
        for (const a of enriched) {
          const key = normalizeTitle(a.title);
          if (!key) continue;
          const existing = groups.get(key);
          if (!existing || a.seen_at > existing.seen_at) {
            groups.set(key, a);
          }
        }

        articles = Array.from(groups.values())
          .sort((a, b) => b.seen_at - a.seen_at)
          .slice(0, MAX_ARTICLES);
        ok = true;
      } catch (parseErr) {
        // GDELT sometimes returns HTML / plain text errors (rate limit,
        // malformed query). Log and skip caching so we retry next time.
        console.warn(
          "gdelt non-json response",
          text.slice(0, 200),
          parseErr,
        );
      }
    }
  } catch (err) {
    console.error("gdelt fetch failed", err);
  }

  // Only cache on success — failures stay uncached so a transient hiccup
  // doesn't pin an empty result for 5 minutes.
  if (ok) cacheSet(cacheKey, articles, CACHE_TTL);
  // Brief negative-cache (15 s) on failure to avoid hammering the upstream
  // rate limit during a stretch of bad responses.
  else cacheSet(cacheKey, articles, 15);

  return articles;
}
