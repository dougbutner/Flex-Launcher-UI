import { numberParts, usdParts } from "@/services/money";

type Props = {
  value: number;
  kind?: "plain" | "usd";
  suffix?: string;
  className?: string;
};

/** Short on-screen number. Native tooltip shows the full value when it was trimmed. */
export function Amount({ value, kind = "plain", suffix = "", className = "" }: Props) {
  const parts = kind === "usd" ? usdParts(value) : numberParts(value);
  const shown = `${parts.display}${suffix ? ` ${suffix}` : ""}`;
  const tip = `${parts.full}${suffix ? ` ${suffix}` : ""}`;
  const trimmed = parts.display !== parts.full;
  return (
    <span className={className} title={trimmed ? tip : undefined}>
      {shown}
    </span>
  );
}
