import { LiveBubbles, type LiveBubbleItem } from "@/components/bubbles/LiveBubbles";
import type { PoolBookRow } from "@/services/poolSanity";
import type { WalletDot } from "@/services/tokenCensus";
import { formatNiceNumber } from "@/services/money";

type Props = {
  pools: PoolBookRow[];
  wallets: WalletDot[];
  officialPoolId: number;
  symbol: string;
};

const QUOTE_COLOR: Record<string, string> = {
  EASY: "#eab308",
  XPR: "#8b5cf6",
  WON: "#f472b6",
  GRAMS: "#fbbf24",
  MEME: "#fb7185",
  XUSDC: "#34d399",
  XMD: "#2dd4bf",
  LOAN: "#38bdf8",
  INDEX: "#818cf8",
  XBTC: "#f59e0b",
};

export function HoldingBubbles({ pools, wallets, officialPoolId, symbol }: Props) {
  const poolItems: LiveBubbleItem[] = pools
    .filter((pool) => pool.tokenQty > 0 || pool.quoteUsd > 0)
    .map((pool) => {
      const quote = pool.quoteSymbol || "pool";
      return {
        id: String(pool.id),
        label: quote,
        href: `https://alcor.exchange/v/xpr/analytics/pools/${pool.id}`,
        value: Math.max(pool.quoteUsd, pool.tokenQty, 1),
        color: QUOTE_COLOR[quote] ?? undefined,
        striped: officialPoolId > 0 && pool.id === officialPoolId,
      };
    });
  const walletItems: LiveBubbleItem[] = wallets.map((row) => ({
    id: row.account,
    label: row.account,
    sub: formatNiceNumber(row.tokens),
    value: row.tokens,
  }));
  return (
    <div className="mt-4 grid gap-4">
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">swap.alcor</h3>
        <LiveBubbles items={poolItems} />
      </div>
      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{symbol} wallets</h3>
        <LiveBubbles items={walletItems} />
      </div>
    </div>
  );
}
