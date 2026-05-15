import { useEffect, useRef, useState } from "react";
import type { AssetUniverseEntry } from "@globe-watch/shared";

interface Props {
  universe: AssetUniverseEntry[];
  activeId: string;
  onPick: (id: string) => void;
  followActive: boolean;
  onToggleFollow: () => void;
}

/**
 * Mobile-only combined chip: shows the active ticker name, opens an
 * asset picker on tap of the label/caret, and toggles "track this
 * asset" via the dot on the right.
 */
export function TickerButton(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = props.universe.find((a) => a.asset_id === props.activeId);
  const is247 = active?.trading_24_7 ?? false;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div
      ref={ref}
      className="md:hidden absolute top-3 left-3 font-mono text-zinc-200 z-30"
    >
      <div className="glass rounded-md flex items-stretch overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-2.5 py-1.5 text-[12px] font-semibold tracking-tight text-white flex items-center gap-1.5 hover:bg-zinc-800/50"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="pick asset"
        >
          <span>{active?.display_name ?? "—"}</span>
          <span className="text-zinc-500 text-[9px]">▾</span>
        </button>
        <button
          type="button"
          onClick={props.onToggleFollow}
          className={`px-2 border-l border-zinc-800/70 text-[12px] leading-none transition-colors ${
            props.followActive
              ? "text-amber-300"
              : "text-zinc-500 hover:text-zinc-200"
          }`}
          aria-label={
            props.followActive ? "stop tracking asset" : "track this asset"
          }
          title={
            is247
              ? "Track 09:00 local — follow the dawn of the trading day"
              : "Track the live exchange for this asset"
          }
        >
          {props.followActive ? "●" : "○"}
        </button>
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 mt-1 w-[220px] glass rounded-md py-1 max-h-[55vh] overflow-y-auto"
        >
          {props.universe.map((a) => {
            const isActive = a.asset_id === props.activeId;
            return (
              <li key={a.asset_id}>
                <button
                  type="button"
                  onClick={() => {
                    props.onPick(a.asset_id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-[12px] flex items-center justify-between gap-2 transition-colors ${
                    isActive
                      ? "bg-amber-500/15 text-amber-100"
                      : "text-zinc-200 hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="font-medium">{a.display_name}</span>
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500">
                    {a.proxies.length} venues
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
