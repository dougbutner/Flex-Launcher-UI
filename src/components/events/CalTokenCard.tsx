import { Link } from "react-router-dom";
import { TokenIcon } from "@/components/TokenIcon";
import { ProgramDots } from "@/components/token/ProgramDots";
import { eventKindLabel, type CalEvent } from "@/services/launchEvents";
import type { FlexProgram } from "@/config/launch";
import { MOCK_CLUB_LOCKS, mockTokenLogo } from "@/test/sandbox/data";

function startLabel(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalTokenCard({ ev, picked = false }: { ev: CalEvent; picked?: boolean }) {
  const program = ev.program === "core" ? "easyflex" : (ev.program as FlexProgram);
  const logo = MOCK_CLUB_LOCKS[ev.symbol] ? mockTokenLogo(ev.symbol) : undefined;
  return (
    <Link
      to={`/token/${ev.contract}/${ev.symbol}`}
      className={`tetra-shimmer group relative block aspect-square overflow-hidden rounded-xl border bg-card shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] transition-colors hover:border-primary/50 ${
        picked ? "border-primary/70" : "border-border"
      }`}
    >
      <TokenIcon
        contract={ev.contract}
        symbol={ev.symbol}
        src={logo}
        fill
        className="pointer-events-none absolute inset-0 opacity-25 group-hover:opacity-40"
      />
      <span className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70" />
      <span className="relative flex h-full flex-col p-2.5">
        <span className="flex items-start justify-between gap-2">
          {ev.quoteSymbol ? (
            <TokenIcon contract={ev.quoteContract} symbol={ev.quoteSymbol} size={22} />
          ) : (
            <span />
          )}
          <ProgramDots program={program} />
        </span>
        <span className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center">
          <TokenIcon contract={ev.contract} symbol={ev.symbol} src={logo} size={40} />
          <span className="truncate font-mono text-lg font-black tracking-tight text-foreground sm:text-xl">
            ${ev.symbol}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {eventKindLabel(ev.kind)}
          </span>
        </span>
        <span className="font-mono text-[10px] leading-tight text-muted-foreground">
          <span className="block text-[9px] uppercase tracking-wide">starts</span>
          <span className="font-semibold text-foreground">{startLabel(ev.at)}</span>
        </span>
      </span>
    </Link>
  );
}
