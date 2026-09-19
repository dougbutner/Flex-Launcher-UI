import { useEffect, useState } from "react";
import { rememberRemoteTokenIcon, tokenIconSrc } from "@/services/tokenIcons";

type Props = {
  symbol: string;
  contract?: string;
  src?: string;
  size?: number;
  className?: string;
  rounded?: "full" | "xl";
  /** Stretch to the parent box (tile backgrounds). */
  fill?: boolean;
};

export function TokenIcon({
  symbol,
  contract = "",
  src: srcProp,
  size = 40,
  className = "",
  rounded = "full",
  fill = false,
}: Props) {
  const src = tokenIconSrc(contract, symbol, srcProp);
  const [broken, setBroken] = useState(false);
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  const shape = rounded === "full" ? "rounded-full" : fill ? "rounded-none" : "rounded-2xl";
  const box = fill ? undefined : { width: size, height: size, fontSize: Math.max(10, size * 0.4) };

  useEffect(() => {
    if (srcProp && contract) rememberRemoteTokenIcon(contract, symbol, srcProp);
  }, [contract, srcProp, symbol]);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    if (fill) {
      return (
        <span
          className={`flex h-full w-full items-center justify-center bg-secondary font-black leading-none text-muted-foreground/50 ${className}`}
          style={{ fontFamily: 'Jost, "Segoe UI", sans-serif', fontSize: "4.5rem" }}
          aria-hidden
        >
          {letter}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-secondary font-black text-muted-foreground ${shape} ${className}`}
        style={{ ...box, fontFamily: 'Jost, "Segoe UI", sans-serif' }}
        role="img"
        aria-label={symbol || "token"}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={fill ? undefined : size}
      height={fill ? undefined : size}
      className={`shrink-0 bg-background ${fill ? "h-full w-full object-cover" : "object-contain"} ${shape} ${className}`}
      onError={() => setBroken(true)}
    />
  );
}
