import { numberParts, usdParts } from "@/services/money";

type Props = {
  value: number;
  kind?: "plain" | "usd";
  suffix?: string;
  className?: string;
};

/** Decimal point and everything after it, at 62% of the surrounding size. */
export function DecimalText({ text, svg = false }: { text: string; svg?: boolean }) {
  const dot = text.indexOf(".");
  if (dot < 0) return <>{text}</>;
  const head = text.slice(0, dot);
  const tail = text.slice(dot);
  if (svg) {
    return (
      <>
        {head}
        <tspan fontSize="0.62em">{tail}</tspan>
      </>
    );
  }
  return (
    <>
      {head}
      <span className="text-[0.62em]">{tail}</span>
    </>
  );
}

/** Short on-screen number. Native tooltip shows the full value when it was trimmed. */
export function Amount({ value, kind = "plain", suffix = "", className = "" }: Props) {
  const parts = kind === "usd" ? usdParts(value) : numberParts(value);
  const shown = `${parts.display}${suffix ? ` ${suffix}` : ""}`;
  const tip = `${parts.full}${suffix ? ` ${suffix}` : ""}`;
  const trimmed = parts.display !== parts.full;
  return (
    <span className={className} title={trimmed ? tip : undefined}>
      <DecimalText text={shown} />
    </span>
  );
}
