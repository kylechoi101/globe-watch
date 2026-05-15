import { useState } from "react";
import type {
  AssetUniverseEntry,
  DriftPoint,
  MarketStatus,
} from "@globe-watch/shared";
import { BigPriceChart } from "./BigPriceChart";
import { ChartsPanel } from "./ChartsPanel";
import { NewsPanel } from "./NewsPanel";
import { ProxyDetailPanel } from "./ProxyDetailPanel";

type Tab = "news" | "charts" | "detail";

interface Props {
  asset: AssetUniverseEntry | null;
  points: DriftPoint[];
  statuses: Record<string, MarketStatus>;
  referenceSymbol: string | null;
}

export function MobileSheet(props: Props) {
  const [tab, setTab] = useState<Tab>("news");
  const [expanded, setExpanded] = useState(false);
  const isBigChart = props.asset?.display_mode === "big_chart";

  return (
    <div
      className={`md:hidden absolute left-0 right-0 bottom-0 glass border-t border-zinc-800/70 flex flex-col z-20 transition-[height] duration-200 ease-out ${
        expanded ? "h-[68vh]" : "h-[44vh]"
      }`}
    >
      <div className="flex items-stretch justify-between border-b border-zinc-800/70 text-[10px] font-mono uppercase tracking-wider">
        <div className="flex flex-1">
          <TabButton active={tab === "news"} onClick={() => setTab("news")}>
            news
          </TabButton>
          <TabButton active={tab === "charts"} onClick={() => setTab("charts")}>
            {isBigChart ? "price" : "drift"}
          </TabButton>
          <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
            detail
          </TabButton>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="px-3 text-zinc-500 hover:text-zinc-200 text-base"
          aria-label={expanded ? "collapse panel" : "expand panel"}
        >
          {expanded ? "▾" : "▴"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "news" && <NewsPanel embedded />}
        {tab === "charts" &&
          (isBigChart && props.asset ? (
            <BigPriceChart
              embedded
              asset={props.asset}
              points={props.points}
              statuses={props.statuses}
            />
          ) : (
            <ChartsPanel
              embedded
              points={props.points}
              referenceSymbol={props.referenceSymbol}
            />
          ))}
        {tab === "detail" && (
          <ProxyDetailPanel
            embedded
            points={props.points}
            statuses={props.statuses}
            referenceSymbol={props.referenceSymbol}
          />
        )}
      </div>
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`flex-1 py-2.5 transition-colors ${
        props.active
          ? "text-zinc-100 border-b border-amber-400/80"
          : "text-zinc-500 hover:text-zinc-300 border-b border-transparent"
      }`}
    >
      {props.children}
    </button>
  );
}
