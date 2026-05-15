interface Props {
  open: boolean;
  onClose: () => void;
}

export function MethodologyPanel(props: Props) {
  if (!props.open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="relative max-w-[680px] w-[94vw] max-h-[88vh] overflow-y-auto glass rounded-2xl px-6 py-5 text-sm text-zinc-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={props.onClose}
          className="absolute top-3 right-4 text-zinc-400 hover:text-white text-xl leading-none"
          aria-label="close"
        >
          ×
        </button>

        <h2 className="text-lg font-semibold tracking-tight">
          Methodology — how drift is measured
        </h2>

        <Section title="What this shows">
          A single underlying asset (S&amp;P 500, Nasdaq, Nikkei, gold,
          bitcoin, …) trades simultaneously in many places: as ETFs on
          different exchanges, or as spot quotes in different fiats. As
          Earth rotates, each venue is open at a different time and prices
          the underlying with whatever information it has. <em>Drift</em> is
          the gap between those simultaneous prices, expressed in basis
          points (1 bps = 0.01%).
        </Section>

        <Section title="Asset pick & venue model">
          The dropdown at the top picks the underlying. Each asset is
          wired to 2–10 venues across major time-zone buckets (Americas /
          Europe / Asia–Pacific), with at most one venue per ~2-hour band
          for equity indexes, and full 10-venue global spread for gold and
          bitcoin where geography matters most.
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-zinc-300">
            <li>
              <strong>Equity indexes (SPX, NDX, Nikkei, FTSE, DAX, …)</strong>
              {" "}— venues are ETF wrappers (SPY, CSPX.L, 1547.T, …).
            </li>
            <li>
              <strong>Gold</strong> — 10 ETF wrappers across NY / Toronto /
              London / Frankfurt / Tokyo / HK / Sydney. Yahoo doesn&apos;t
              expose XAU spot pairs, so wrappers are the only option.
            </li>
            <li>
              <strong>Bitcoin</strong> — 10 spot fiat pairs (BTC-USD,
              BTC-EUR, BTC-JPY, BTC-KRW, BTC-CNY, …). No ETF wrappers, no
              NAV premium/discount; the drift you see is pure cross-
              currency disagreement on what 1 BTC is worth right now.
            </li>
          </ul>
        </Section>

        <Section title="Step 1 — implied underlying value">
          Each venue is a currency-translated, scaled view of the
          underlying. We invert that scaling to get what each venue
          implies the underlying is worth in USD:
          <Eq>{`implied_USD(i) = (price_local × FX_to_USD) / kᵢ`}</Eq>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-zinc-300">
            <li>
              <code>price_local</code> — venue&apos;s last regular-session
              price, in its native currency (London prices auto-normalize
              from GBp pence to GBP).
            </li>
            <li>
              <code>FX_to_USD</code> — live spot rate as USD per 1 unit of
              local. Universe.json declares either <code>XXXUSD=X</code>
              (high-magnitude direct rate) or <code>USDXXX=X</code> (the
              inverse, when the direct pair is truncated — see
              &quot;FX precision&quot; below).
            </li>
            <li>
              <code>kᵢ</code> — scaling factor for venue <em>i</em>:
              <code>proxy_usd_price / underlying_index</code>. <code>kᵢ = 1</code>
              for spot pairs (the price already IS the underlying value
              in local currency). For ETF wrappers, seed values are fit to
              current spot; production accuracy needs a 60-day OLS refit
              quarterly.
            </li>
          </ul>
        </Section>

        <Section title="Step 2 — drift in basis points">
          One venue is chosen as the live <em>reference</em>: a
          reference-flagged candidate that is currently in its main trading
          session. When all are closed, the freshest candidate&apos;s last
          close wins. Drift is each venue&apos;s deviation from that
          reference:
          <Eq>{`drift(i) = 10⁴ × ( implied_USD(i) − implied_USD(ref) ) / implied_USD(ref)`}</Eq>
          Positive = venue is rich vs reference; negative = cheap.
        </Section>

        <Section title="Step 3 — as the globe turns">
          The reference flips throughout the day as sessions hand off. For
          a 24/5 asset like the S&amp;P 500:
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-zinc-300">
            <li>NY hours: SPY is the reference</li>
            <li>After NY close, London is open: CSPX.L</li>
            <li>After London close, Tokyo is open: 1547.T</li>
            <li>
              Synchronized closures: freshest candidate&apos;s last close is
              the frozen anchor
            </li>
          </ul>
          For Bitcoin (<code>trading_24_7: true</code>), every venue is
          always &quot;live&quot; — the spot pair never closes. The reference
          still rotates as the largest-volume window moves around the
          planet.
        </Section>

        <Section title="What real drift comes from">
          <ul className="list-disc pl-5 space-y-0.5 text-zinc-300">
            <li>
              <strong>Cross-listing latency.</strong> New information reaches
              different venues at slightly different times.
            </li>
            <li>
              <strong>Overnight pricing-in.</strong> Tokyo&apos;s S&amp;P
              proxy at open prices an expectation of the next US session.
            </li>
            <li>
              <strong>AP arbitrage residuals.</strong> ETF wrappers close most
              of the spread within seconds, but a small residual persists.
            </li>
            <li>
              <strong>FX drift during equity off-hours.</strong> Foreign-listed
              wrappers&apos; USD value tracks both the underlying and the
              FX rate; an FX-only move shifts the apparent drift.
            </li>
            <li>
              <strong>Cross-currency BTC premia.</strong> Korean &quot;kimchi
              premium&quot;, Chinese yuan basis, Indian INR premium — local
              demand and capital-control friction make BTC trade
              persistently rich or cheap in some fiats.
            </li>
          </ul>
        </Section>

        <Section title="What looks like drift but isn't (skeptical view)">
          <ul className="list-disc pl-5 space-y-0.5 text-zinc-300">
            <li>
              <strong>Stale kᵢ (ETF wrappers).</strong> Accumulating ETFs
              reinvest dividends, so kᵢ grows ~2% per year. Distributing
              ETFs drop at ex-div dates. Refit quarterly; otherwise old k
              values produce slowly growing phantom drift.
            </li>
            <li>
              <strong>FX-quote timing mismatch.</strong> FX is 24/5; equities
              aren&apos;t. During Asia hours your SPY price is the NY
              close (hours stale) while FX has ticked freshly.
            </li>
            <li>
              <strong>Closed-market anchors.</strong> Yahoo&apos;s
              <code>regularMarketPrice</code> excludes pre/post sessions,
              so the comparison anchor can be hours-to-days stale on
              weekends and holidays.
            </li>
            <li>
              <strong>Reference-switching discontinuities.</strong> When the
              live reference flips at a session handoff, every other
              venue&apos;s drift baseline shifts by exactly the drift between
              the old and new reference. Past samples used the old
              reference; future ones use the new one. Sharp visual jumps
              are usually this, not market action.
            </li>
            <li>
              <strong>NAV premium/discount.</strong> ETF wrappers in thinner
              venues persistently trade ±5–20 bps off NAV. Structural,
              not a market signal.
            </li>
            <li>
              <strong>Free-tier data delays.</strong> Some Yahoo symbols are
              15-minute delayed. The hover tooltip exposes per-quote staleness;
              the chart doesn&apos;t visually mark it.
            </li>
          </ul>
        </Section>

        <Section title="FX precision (small-unit currencies)">
          Yahoo truncates direct rates for low-magnitude currencies — e.g.
          <code>KRWUSD=X = 0.0007</code> instead of the real <code>0.000670</code>,
          a 4% relative error that would manifest as ~400 bps of phantom
          drift on BTC-KRW. To avoid this, the universe.json declares the
          USD-prefixed pair (<code>USDKRW=X = 1492.68</code>) for KRW, CNY,
          INR, RUB, and JPY where the direct pair is too coarse. The
          drift library auto-detects the orientation: <code>XXXUSD=X</code>
          is used as-is, <code>USDXXX=X</code> is inverted to recover
          full precision.
        </Section>

        <Section title="Day/night shader">
          The terminator is shaded by a custom GLSL material. Sun
          direction is computed from a NOAA mean-sun formula (declination
          + right ascension − GMST) and converted to a world-space unit
          vector. Vertex normals are transformed by the model matrix (not
          the normal matrix), so the lit hemisphere stays anchored to the
          planet as you orbit the camera. Day and night textures are
          NASA Blue Marble and Black Marble — city lights are baked into
          the night side.
        </Section>

        <Section title="News panel & globe pins">
          Headlines come from{" "}
          <a
            href="https://gdeltproject.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline"
          >
            GDELT 2.0
          </a>
          , a free academic / research news index. Per-asset keyword
          queries; English-language; up to 10 entries after wire-service
          dedup (titles normalized to a 70-char prefix, freshest kept per
          group); cached 5 minutes server-side to respect GDELT&apos;s
          1-req-per-5-s guidance. Only the headline + source domain +
          timestamp are shown — no article body is reproduced or cached.
          {" "}
          <strong>Pinning:</strong> we scan the headline for a place name
          first (longest-match wins against a ~135-entry registry of
          countries / cities / institutional aliases like &quot;Wall
          Street&quot;, &quot;ECB&quot;, &quot;the Fed&quot;). Only if no
          place is mentioned do we fall back to the publisher&apos;s
          source country. So a Reuters article from London about Tokyo
          gets pinned to Tokyo, not London.
        </Section>

        <Section title="Selection model">
          Click a headline (in the panel) or a pin (on the globe) once
          to preview: the camera flies, the dot grows, a floating callout
          renders the title pinned to the dot. Click any of those three
          targets a second time — or click the callout&apos;s × — to open
          the publisher in a new tab and clear the selection. Clicking
          empty globe, or pressing <kbd>Esc</kbd>, deselects without
          opening anything.
        </Section>

        <Section title="What this is and isn't">
          <p>
            This is an observational visualization of how price discovery
            propagates across the global market day. It is{" "}
            <strong>not a trading signal</strong> — drift here is
            contaminated by NAV mechanics, FX timing, scaling-factor
            decay, and reference-selection artifacts. Useful for
            intuition; treat as such.
          </p>
        </Section>

        <Section title="Data sources & license">
          Quotes via Yahoo Finance v8 chart endpoint (undocumented public
          API; subject to change). News via{" "}
          <a
            href="https://gdeltproject.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline"
          >
            GDELT Project
          </a>
          . Textures via NASA Visible Earth / Black Marble. Source code
          and methodology under{" "}
          <a
            href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300 underline"
          >
            CC BY-NC-SA 4.0
          </a>
          {" "}— attribution required, non-commercial, share-alike.
        </Section>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-zinc-100 font-semibold mb-1 text-sm uppercase tracking-wider">
        {props.title}
      </h3>
      <div className="text-zinc-300 leading-relaxed text-[13px]">
        {props.children}
      </div>
    </div>
  );
}

function Eq(props: { children: React.ReactNode }) {
  return (
    <div className="my-1 px-3 py-2 rounded-md bg-zinc-900/70 border border-zinc-800 font-mono text-[12px] text-amber-200">
      {props.children}
    </div>
  );
}
