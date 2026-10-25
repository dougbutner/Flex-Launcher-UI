import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { rememberRemoteTokenIcon, storeLogoQuiet, subscribeTokenIcons, tokenIconEpoch, tokenIconPlaces } from "@/services/tokenIcons";

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
  const epoch = useSyncExternalStore(subscribeTokenIcons, tokenIconEpoch, tokenIconEpoch);
  const places = useMemo(() => tokenIconPlaces(contract, symbol, srcProp), [contract, epoch, srcProp, symbol]);
  const list = places.join("|");
  const [step, setStep] = useState(0);
  const src = places[step];
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  const shape = "rounded-none";
  const box = fill ? undefined : { width: size, height: size, fontSize: Math.max(10, size * 0.4) };

  useEffect(() => {
    if (srcProp && contract) rememberRemoteTokenIcon(contract, symbol, srcProp);
  }, [contract, srcProp, symbol]);

  useEffect(() => {
    setStep(0);
  }, [list]);

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

  const easy = !fill && symbol.trim().toUpperCase() === "EASY";
  const img = (
    <img
      src={src}
      alt={symbol}
      width={easy ? undefined : fill ? undefined : size}
      height={easy ? undefined : fill ? undefined : size}
      decoding="async"
      className={
        easy
          ? "h-full w-full origin-center scale-[1.28] object-cover"
          : `shrink-0 bg-transparent object-contain ${fill ? "h-full w-full" : ""} ${shape} ${className}`
      }
      onLoad={() => {
        if (src && !src.startsWith("/") && !src.startsWith("data:") && !src.startsWith("blob:")) storeLogoQuiet(contract, symbol, src);
      }}
      onError={() => setStep((n) => n + 1)}
    />
  );
  if (!easy) return img;
  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`} style={box}>
      {img}
    </span>
  );
}
