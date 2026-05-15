interface Props {
  active: boolean;
  onToggle: () => void;
}

export function FollowIndexButton(props: Props) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      title="Camera tracks whichever exchange is currently open. If no exchange is open, points to the longitude where local time is 08:00."
      className={`absolute top-3 right-3 md:top-4 md:right-4 glass rounded-md px-2 py-1 md:px-3 md:py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
        props.active
          ? "text-amber-300 border-amber-500/30"
          : "text-zinc-400 hover:text-zinc-100"
      }`}
      aria-label={props.active ? "stop following index" : "follow index"}
    >
      <span className="md:hidden">{props.active ? "●" : "○"}</span>
      <span className="hidden md:inline">
        {props.active ? "● follow index" : "○ follow index"}
      </span>
    </button>
  );
}
