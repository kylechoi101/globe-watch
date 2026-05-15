import { useEffect, useRef, useState } from "react";
import type { AssetUniverseEntry } from "@globe-watch/shared";

interface Props {
  universe: AssetUniverseEntry[];
  activeId: string;
  onPick: (id: string) => void;
}

export function AssetPicker(props: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = props.universe.find((a) => a.asset_id === props.activeId);

  // Click outside closes the dropdown.
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
      className="hidden md:block absolute top-3 left-1/2 -translate-x-1/2 font-mono text-zinc-200 z-30"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass rounded-md px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-300 hover:text-white flex items-center gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-zinc-500">tracking</span>
        <span className="text-white">{active?.display_name ?? "—"}</span>
        <span className="text-zinc-500 text-[9px]">▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-1/2 -translate-x-1/2 mt-1 w-[220px] glass rounded-md py-1 max-h-[40vh] md:max-h-[60vh] overflow-y-auto"
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
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between gap-2 transition-colors ${
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
