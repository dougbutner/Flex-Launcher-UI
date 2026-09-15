import { Link } from "react-router-dom";
import { Amount } from "@/components/Amount";
import { TokenIcon } from "@/components/TokenIcon";
import { ProgramDots } from "@/components/token/ProgramDots";
import type { FlexProgram } from "@/config/launch";

type Props = {
  program: FlexProgram;
  contract: string;
  symbol: string;
  quoteContract?: string;
  quoteSymbol?: string;
  mcapUsd?: number;
  liqUsd?: number;
  to?: string;
};

/** Square token tile: quote logo, ticker, program dots, mcap + backing liq. */
export function TokenTile({
  program,
  contract,
  symbol,
  quoteContract = "",
  quoteSymbol = "",
  mcapUsd,
  liqUsd,
  to,
}: Props) {
  const href = to ?? `/token/${contract}/${symbol}`;
  return (
    <Link
      to={href}
      className="group relative block aspect-square overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] transition-colors hover:border-primary/50"
    >
      <TokenIcon
        contract={contract}
        symbol={symbol}
        fill
        className="pointer-events-none absolute inset-0 opacity-25 group-hover:opacity-40"
      />
      <span className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70" />
      <span className="relative flex h-full flex-col p-2.5">
        <span className="flex items-start justify-between gap-2">
          {quoteSymbol ? (
            <TokenIcon contract={quoteContract} symbol={quoteSymbol} size={22} rounded="full" />
          ) : (
            <span />
          )}
          <ProgramDots program={program} />
        </span>
        <span className="flex flex-1 items-center justify-center px-1">
          <span className="truncate font-mono text-xl font-black tracking-tight text-foreground sm:text-2xl">
            {symbol}
          </span>
        </span>
        <span className="flex items-end justify-between gap-2 font-mono text-[10px] leading-tight text-muted-foreground">
          <span>
            <span className="block text-[9px] uppercase tracking-wide">mcap</span>
            <span className="font-semibold text-primary">
              <Amount value={mcapUsd ?? 0} kind="usd" />
            </span>
          </span>
          <span className="text-right">
            <span className="block text-[9px] uppercase tracking-wide">liq</span>
            <span className="font-semibold text-foreground">
              <Amount value={liqUsd ?? 0} kind="usd" />
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}
