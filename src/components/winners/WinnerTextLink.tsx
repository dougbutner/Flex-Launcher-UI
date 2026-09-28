export function WinnerTextLink({
  label,
  active,
  onClick,
  bar = false,
  disabled = false,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  bar?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      className={`text-[11px] uppercase tracking-[0.22em] ${
        disabled
          ? "cursor-not-allowed text-muted-foreground opacity-40"
          : active
            ? bar
              ? "text-foreground"
              : "text-primary"
            : "text-muted-foreground hover:text-foreground/80"
      } ${bar ? `border-b-2 pb-1 ${active && !disabled ? "border-primary" : "border-transparent"}` : ""}`}
      aria-current={active && !disabled ? "true" : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
