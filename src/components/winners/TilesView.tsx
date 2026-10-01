import { TokenTile } from "@/components/token/TokenTile";
import {
  BOARD_SECTION_LIMIT,
  sortLargeCap,
  sortLoudest,
  sortNewcomers,
  sortPopular,
  type BoardToken,
} from "@/services/leaderboardStore";
import { MOCK_CLUB_LOCKS, mockTokenLogo } from "@/test/sandbox/data";
import type { WinnerViewProps } from "@/components/winners/types";

function tileSrc(symbol: string) {
  return MOCK_CLUB_LOCKS[symbol] ? mockTokenLogo(symbol) : undefined;
}

function Section({ title, blurb, tokens }: { title: string; blurb: string; tokens: BoardToken[] }) {
  if (!tokens.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{blurb}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tokens.slice(0, BOARD_SECTION_LIMIT).map((t) => (
          <TokenTile
            key={`${title}:${t.id}`}
            program={t.program}
            contract={t.contract}
            symbol={t.symbol}
            quoteContract={t.quoteContract}
            quoteSymbol={t.quoteSymbol}
            mcapUsd={t.mcapUsd}
            liqUsd={t.liqUsd}
            pre={t.pre}
            src={tileSrc(t.symbol)}
          />
        ))}
      </div>
    </section>
  );
}

export function TilesView({ tokens }: WinnerViewProps) {
  return (
    <>
      <Section title="Newcomers" blurb="Newest liftoffs. Fresh range, fresh book." tokens={sortNewcomers(tokens)} />
      <Section title="Loudest" blurb="Highest 24h Alcor volume across that token's pools." tokens={sortLoudest(tokens)} />
      <Section title="Large Cap" blurb="Biggest market cap among launched flex tokens." tokens={sortLargeCap(tokens)} />
      <Section title="Popular" blurb="Most holders on the flexer book." tokens={sortPopular(tokens)} />
    </>
  );
}
