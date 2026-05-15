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
      className={`absolute top-4 right-4 glass rounded-md px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
        props.active
          ? "text-amber-300 border-amber-500/30"
          : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {props.active ? "● follow index" : "○ follow index"}
    </button>
  );
}
