import { useEffect, useState } from "react";
import { rememberRemoteTokenIcon, tokenIconSrc } from "@/services/tokenIcons";

type Props = {
  symbol: string;
  contract?: string;
  src?: string;
  size?: number;
  className?: string;
  rounded?: "full" | "xl";
};

export function TokenIcon({
  symbol,
  contract = "",
  src: srcProp,
  size = 40,
  className = "",
  rounded = "full",
}: Props) {
  const src = tokenIconSrc(contract, symbol, srcProp);
  const [broken, setBroken] = useState(false);
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  const shape = rounded === "full" ? "rounded-full" : "rounded-2xl";

  useEffect(() => {
    if (srcProp && contract) rememberRemoteTokenIcon(contract, symbol, srcProp);
  }, [contract, srcProp, symbol]);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  if (!src || broken) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-secondary font-black text-muted-foreground ${shape} ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
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
      width={size}
      height={size}
      className={`shrink-0 bg-background object-contain ${shape} ${className}`}
      onError={() => setBroken(true)}
    />
  );
}
