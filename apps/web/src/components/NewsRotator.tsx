import { useEffect, useRef, useState } from "react";
import type { NewsArticle } from "@globe-watch/shared";
import { useStore } from "../state/store";

interface Props {
  articles: NewsArticle[];
}

const ROTATE_MS = 6000;
const SWIPE_PX = 40;

/**
 * Mobile-only auto-advancing news strip at the bottom of the screen.
 * Cycles through up to 8 articles. Arrows (or swipe) move prev/next
 * and pause auto-advance briefly. First tap on the headline: fly the
 * globe + select. Second tap on a selected headline opens the source.
 */
export function NewsRotator(props: Props) {
  const articles = props.articles.slice(0, 8);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const flyTo = useStore((s) => s.flyTo);
  const selectedUrl = useStore((s) => s.selectedArticleUrl);
  const selectArticle = useStore((s) => s.selectArticle);
  const pauseTimeout = useRef<number | null>(null);

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

  function pauseBriefly() {
    setPaused(true);
    if (pauseTimeout.current) window.clearTimeout(pauseTimeout.current);
    pauseTimeout.current = window.setTimeout(() => setPaused(false), 15_000);
  }

  function go(delta: number) {
    if (articles.length === 0) return;
    setIndex((i) => (i + delta + articles.length) % articles.length);
    pauseBriefly();
  }

  // Touch swipe support
  const touchStartX = useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < SWIPE_PX) return;
    go(dx > 0 ? -1 : 1);
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
    pauseBriefly();
    if (isSelected) {
      selectArticle(null);
      return;
    }
    e.preventDefault();
    if (a.lat != null && a.lon != null) flyTo(a.lat, a.lon);
    selectArticle(a.url);
  };

  return (
    <div
      className="md:hidden absolute left-3 right-3 bottom-3 z-20 glass rounded-md font-mono"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onTap}
        className={`relative block px-3 py-2 transition-colors ${
          isSelected ? "bg-amber-500/5" : ""
        }`}
      >
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-zinc-500">
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
        <div
          className={`mt-0.5 text-[12px] leading-snug line-clamp-2 ${
            isSelected ? "text-amber-100" : "text-zinc-100"
          }`}
        >
          {a.title}
        </div>
      </a>

      <div className="flex items-center gap-2 px-2 pb-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => go(-1)}
          className="w-7 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-800/60 text-sm leading-none"
          aria-label="previous article"
        >
          ◀
        </button>
        <div className="flex gap-1 flex-1 min-w-0">
          {articles.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setIndex(i);
                pauseBriefly();
              }}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i === index ? "bg-zinc-200" : "bg-zinc-700/60 hover:bg-zinc-500"
              }`}
              aria-label={`article ${i + 1}`}
            />
          ))}
        </div>
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider tabular-nums">
          {index + 1}/{articles.length}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          className="w-7 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-zinc-800/60 text-sm leading-none"
          aria-label="next article"
        >
          ▶
        </button>
      </div>
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
