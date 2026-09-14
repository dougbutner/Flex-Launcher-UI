import type { FlexProgram } from "@/config/launch";

const DOT = "h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]";

/** One / two / triangle dots for easyflex, complexflex, flexforex. */
export function ProgramDots({ program }: { program: FlexProgram }) {
  const label =
    program === "easyflex" ? "easyflex" : program === "complexflex" ? "complexflex" : "flexforex";
  if (program === "easyflex") {
    return (
      <span className="inline-flex" title={label} aria-label={label}>
        <span className={DOT} />
      </span>
    );
  }
  if (program === "complexflex") {
    return (
      <span className="inline-flex gap-0.5" title={label} aria-label={label}>
        <span className={DOT} />
        <span className={DOT} />
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-center gap-0.5" title={label} aria-label={label}>
      <span className={DOT} />
      <span className="inline-flex gap-0.5">
        <span className={DOT} />
        <span className={DOT} />
      </span>
    </span>
  );
}
