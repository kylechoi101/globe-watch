import { useEffect, useState } from "react";
import type { NewsArticle } from "@globe-watch/shared";
import { useStore } from "../state/store";

interface Props {
  articles: NewsArticle[];
  visible: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const ROTATE_MS = 6000;

/**
 * Mobile-only auto-advancing news strip at the bottom of the screen.
 * Cycles through up to 8 articles. First tap: fly the globe to the
 * article's location + select it (showing the headline on the dot).
 * Second tap: open the source URL.
 */
export function NewsRotator(props: Props) {
  const articles = props.articles.slice(0, 8);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const flyTo = useStore((s) => s.flyTo);
  const selectedUrl = useStore((s) => s.selectedArticleUrl);
  const selectArticle = useStore((s) => s.selectArticle);

  useEffect(() => {
    if (paused || articles.length < 2) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % articles.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, articles.length]);

  useEffect(() => {
    if (index >= articles.length) setIndex(0);
  }, [articles.length, index]);

  if (!props.visible) {
    return (
      <button
        type="button"
        onClick={props.onOpen}
        className="md:hidden absolute right-3 bottom-3 glass rounded-full px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-300 hover:text-white z-20 flex items-center gap-1.5"
        aria-label="show news feed"
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        news
      </button>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="md:hidden absolute left-3 right-3 bottom-3 glass rounded-md px-3 py-2 text-zinc-500 font-mono text-[11px] z-20">
        fetching headlines…
      </div>
    );
  }

  const a = articles[index];
  const isSelected = selectedUrl === a.url;

  const onTap = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setPaused(true);
    if (isSelected) {
      selectArticle(null);
      return;
    }
    e.preventDefault();
    if (a.lat != null && a.lon != null) flyTo(a.lat, a.lon);
    selectArticle(a.url);
  };

  return (
    <div className="md:hidden absolute left-3 right-3 bottom-3 z-20">
      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onTap}
        className={`relative block glass rounded-md px-3 py-2 pr-7 font-mono transition-colors ${
          isSelected ? "ring-1 ring-amber-400/40 bg-amber-500/5" : ""
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            props.onClose();
          }}
          className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-zinc-100 text-sm leading-none"
          aria-label="hide news feed"
        >
          ×
        </button>
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-zinc-500">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              a.lat != null ? "bg-amber-400" : "bg-zinc-600"
            }`}
          />
          <span>{a.domain}</span>
          <span className="text-zinc-700">·</span>
          <span>{a.source_country || "—"}</span>
          <span className="ml-auto mr-5 text-zinc-600">
            {fmtRelative(a.seen_at)}
          </span>
        </div>
        <div
          className={`mt-0.5 text-[12px] leading-snug line-clamp-2 ${
            isSelected ? "text-amber-100" : "text-zinc-100"
          }`}
        >
          {a.title}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex gap-1 flex-1 min-w-0">
            {articles.map((_, i) => (
              <span
                key={i}
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  i === index ? "bg-zinc-300" : "bg-zinc-700/60"
                }`}
              />
            ))}
          </div>
          {isSelected ? (
            <span className="text-[9px] text-amber-300 uppercase tracking-wider shrink-0">
              tap to open ↗
            </span>
          ) : (
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider shrink-0">
              {index + 1}/{articles.length}
            </span>
          )}
        </div>
      </a>
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
