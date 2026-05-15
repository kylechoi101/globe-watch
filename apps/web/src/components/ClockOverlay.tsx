import type { ExchangeMeta, MarketStatus } from "@globe-watch/shared";

export function ClockOverlay(props: {
  exchanges: ExchangeMeta[];
  statuses: Record<string, MarketStatus>;
  referenceSymbol: string | null;
  referenceCity: string | null;
  followIndex: boolean;
  onToggleFollowIndex: () => void;
  cacheAgeSeconds: number;
}) {
  const open = props.exchanges.filter((e) => props.statuses[e.mic]?.is_open);
  const next = nextOpenExchange(props.exchanges, props.statuses);

  return (
    <div className="absolute top-4 right-4 w-[320px] glass rounded-xl px-4 py-3 text-xs font-mono text-zinc-200 shadow-2xl">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold tracking-tight">globe-watch</span>
        <span className="text-zinc-500">S&amp;P 500 · live</span>
      </div>
      <hr className="my-2 border-zinc-700" />

      <div className="text-zinc-400">Open right now</div>
      {open.length === 0 ? (
        <div className="text-zinc-500 italic">— all major exchanges closed —</div>
      ) : (
        <ul className="mb-2">
          {open.map((e) => (
            <li key={e.mic} className="flex justify-between">
              <span className="text-emerald-400">● {e.name}</span>
              <span className="text-zinc-500">{e.timezone.split("/").pop()}</span>
            </li>
          ))}
        </ul>
      )}

      {next && (
        <div className="text-zinc-400 mt-1">
          Next: <span className="text-zinc-100">{next.name}</span>{" "}
          <span className="text-zinc-500">
            in {formatCountdown(next.in_seconds)}
          </span>
        </div>
      )}

      <hr className="my-2 border-zinc-700" />
      <div className="flex justify-between">
        <span className="text-zinc-400">Reference</span>
        <span>
          {props.referenceSymbol ? (
            <>
              {props.referenceSymbol}
              <span className="text-zinc-500"> · {props.referenceCity ?? ""}</span>
            </>
          ) : (
            "—"
          )}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-zinc-400">Cache age</span>
        <span className={props.cacheAgeSeconds > 10 ? "text-amber-400" : ""}>
          {props.cacheAgeSeconds}s
        </span>
      </div>

      <button
        type="button"
        onClick={props.onToggleFollowIndex}
        className={`mt-2 w-full text-left text-[11px] uppercase tracking-wider rounded px-2 py-1 ${
          props.followIndex
            ? "bg-amber-500/20 text-amber-300"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        }`}
        title="When on: camera tracks the currently-open market. If no market is open, it points to wherever it's 8 AM local."
      >
        {props.followIndex ? "● follow the index (on)" : "○ follow the index"}
      </button>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function nextOpenExchange(
  exchanges: ExchangeMeta[],
  statuses: Record<string, MarketStatus>,
): { name: string; in_seconds: number } | null {
  let best: { name: string; in_seconds: number } | null = null;
  const now = Math.floor(Date.now() / 1000);
  for (const ex of exchanges) {
    const s = statuses[ex.mic];
    if (!s || s.is_open) continue;
    const delta = s.next_open_utc - now;
    if (delta <= 0) continue;
    if (!best || delta < best.in_seconds) {
      best = { name: ex.name, in_seconds: delta };
    }
  }
  return best;
}
