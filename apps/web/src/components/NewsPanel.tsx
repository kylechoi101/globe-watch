import useSWR from "swr";
import type { NewsArticle, NewsResponse } from "@globe-watch/shared";
import { useStore } from "../state/store";
import { api } from "../lib/api";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<NewsResponse>);

export function NewsPanel() {
  const { data, isLoading } = useSWR<NewsResponse>(
    api("/api/news"),
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
    },
  );
  const flyTo = useStore((s) => s.flyTo);

  const selectedUrl = useStore((s) => s.selectedArticleUrl);
  const selectArticle = useStore((s) => s.selectArticle);
  const articles = (data?.articles ?? []).slice(0, 10);

  const handleRowClick =
    (a: NewsArticle) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (selectedUrl === a.url) {
        // Second click on the already-selected article → open the source.
        // Let the anchor's target="_blank" handle the navigation.
        selectArticle(null);
        return;
      }
      // First click → preview on globe (fly + show headline label on the dot).
      e.preventDefault();
      if (a.lat != null && a.lon != null) flyTo(a.lat, a.lon);
      selectArticle(a.url);
    };

  return (
    <div className="absolute bottom-4 left-4 w-[340px] glass rounded-lg flex flex-col max-h-[calc(100vh-360px)]">
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/60">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          global news
        </span>
        <span className="text-[9px] uppercase tracking-wider text-zinc-600">
          gdelt
        </span>
      </header>

      {articles.length === 0 ? (
        <div className="px-3 py-4 text-xs text-zinc-500 font-mono flex items-center gap-2">
          {isLoading ? (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>fetching global headlines…</span>
            </>
          ) : (
            <span>no recent English-language headlines.</span>
          )}
        </div>
      ) : (
        <ul className="overflow-y-auto divide-y divide-zinc-800/60">
          {articles.map((a) => {
            const isSelected = selectedUrl === a.url;
            return (
              <li key={a.url}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleRowClick(a)}
                  className={`block px-3 py-1.5 text-[11px] font-mono transition-colors ${
                    isSelected
                      ? "bg-amber-500/10"
                      : "hover:bg-zinc-800/40"
                  }`}
                  title={
                    isSelected
                      ? "Click again to open article"
                      : `${a.domain} · ${a.source_country} · ${fmtRelative(a.seen_at)}\nClick to fly globe + show headline on the dot.`
                  }
                >
                  <div className="flex items-center gap-2 mb-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        a.lat != null ? "bg-amber-400" : "bg-zinc-600"
                      }`}
                    />
                    <span>{a.domain}</span>
                    <span className="text-zinc-700">·</span>
                    <span>{a.source_country || "—"}</span>
                    <span className="ml-auto text-zinc-600">
                      {fmtRelative(a.seen_at)}
                    </span>
                  </div>
                  <div className={isSelected ? "text-amber-100 leading-snug" : "text-zinc-100 leading-snug"}>
                    {a.title}
                  </div>
                  {isSelected && (
                    <div className="text-[10px] text-amber-300 mt-1 uppercase tracking-wider">
                      click again to open ↗
                    </div>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function fmtRelative(seen_at: number): string {
  const diff = Math.floor(Date.now() / 1000) - seen_at;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
