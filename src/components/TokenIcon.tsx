import { useEffect, useState } from "react";
import { localLogoSrc, localTokenIconSrc, rememberRemoteTokenIcon, storeLogoQuiet, tokenIconRemote } from "@/services/tokenIcons";

type Props = {
  symbol: string;
  contract?: string;
  src?: string;
  size?: number;
  className?: string;
  rounded?: "full" | "xl" | "md";
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
  const remote = tokenIconRemote(contract, symbol, srcProp);
  const bundled = localTokenIconSrc(contract, symbol);
  const local = bundled || localLogoSrc(contract, symbol, remote || srcProp);
  const [missedLocal, setMissedLocal] = useState(false);
  const [broken, setBroken] = useState(false);
  const src = broken ? undefined : missedLocal && !bundled ? remote : local || remote;
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  const shape =
    rounded === "full" ? "rounded-full" : rounded === "md" ? "rounded-md" : fill ? "rounded-none" : "rounded-2xl";
  const box = fill ? undefined : { width: size, height: size, fontSize: Math.max(10, size * 0.4) };

  useEffect(() => {
    if (srcProp && contract) rememberRemoteTokenIcon(contract, symbol, srcProp);
  }, [contract, srcProp, symbol]);

  useEffect(() => {
    setMissedLocal(false);
    setBroken(false);
  }, [local, remote]);

  if (!src) {
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
      decoding="async"
      className={`shrink-0 bg-background ${fill ? "h-full w-full object-cover" : "object-contain"} ${shape} ${className}`}
      onLoad={() => {
        if (remote && src === remote) storeLogoQuiet(contract, symbol, remote);
      }}
      onError={() => {
        if (!bundled && remote && src !== remote) setMissedLocal(true);
        else setBroken(true);
      }}
    />
  );
}
