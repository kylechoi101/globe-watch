export function Footer() {
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pb-1 text-[9px] font-mono text-zinc-600 whitespace-nowrap pointer-events-none">
      educational · not financial advice · data{" "}
      <a
        href="https://finance.yahoo.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-zinc-400 underline-offset-2 pointer-events-auto"
      >
        yahoo
      </a>{" "}
      ·{" "}
      <a
        href="https://gdeltproject.org"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-zinc-400 underline-offset-2 pointer-events-auto"
      >
        gdelt
      </a>{" "}
      ·{" "}
      <a
        href="https://visibleearth.nasa.gov"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-zinc-400 underline-offset-2 pointer-events-auto"
      >
        nasa
      </a>{" "}
      ·{" "}
      <a
        href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-zinc-400 underline-offset-2 pointer-events-auto"
      >
        cc by-nc-sa 4.0
      </a>
    </div>
  );
}
