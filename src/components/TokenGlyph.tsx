import { TokenIcon } from "@/components/TokenIcon";

type Props = {
  symbol: string;
  contract?: string;
  src?: string;
  size?: number;
  className?: string;
};

/** Token mark plus the full ticker. Fallback letter never stands alone. */
export function TokenGlyph({ symbol, contract = "", src, size = 28, className = "" }: Props) {
  const code = (symbol || "").toUpperCase();
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <TokenIcon contract={contract} symbol={code} src={src} size={size} />
      <span className="truncate font-mono font-black tracking-tight">${code || "-"}</span>
    </span>
  );
}
