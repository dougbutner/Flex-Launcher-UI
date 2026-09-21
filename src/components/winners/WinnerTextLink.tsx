export function WinnerTextLink({
  label,
  active,
  onClick,
  bar = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  bar?: boolean;
}) {
  return (
    <button
      type="button"
      className={`text-[11px] uppercase tracking-[0.22em] ${
        active ? (bar ? "text-foreground" : "text-primary") : "text-muted-foreground hover:text-foreground/80"
      } ${bar ? `border-b-2 pb-1 ${active ? "border-primary" : "border-transparent"}` : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
