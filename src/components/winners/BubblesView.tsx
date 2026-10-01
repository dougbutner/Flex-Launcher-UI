import { LiveBubbles, type LiveBubbleItem } from "@/components/bubbles/LiveBubbles";
import { fmtUsd } from "@/services/money";
import { fmtPctChange } from "@/services/alcorMarket";
import type { BoardToken } from "@/services/leaderboardStore";
import {
  bubbleValue,
  changePct,
  type BubbleSizeId,
  type ChangeWindowId,
  type WinnerExtra,
} from "@/services/winnerViews";
import type { WinnerViewProps } from "@/components/winners/types";

function formatSize(token: BoardToken, size: BubbleSizeId, extra: WinnerExtra | undefined, chg: ChangeWindowId) {
  if (size === "holders") return String(token.holders);
  if (size === "change") return fmtPctChange(changePct(extra, chg));
  if (size === "volume") return fmtUsd(token.volumeUsd);
  if (size === "mcap") return fmtUsd(token.mcapUsd);
  return fmtUsd(token.liqUsd);
}

function fillFor(token: BoardToken, extra: WinnerExtra | undefined, chg: ChangeWindowId, size: BubbleSizeId) {
  if (size === "change") {
    const n = changePct(extra, chg);
    if (n > 0) return "hsl(142 65% 38%)";
    if (n < 0) return "hsl(0 72% 42%)";
    return "hsl(40 8% 28%)";
  }
  if (token.program === "easyflex") return "hsl(142 62% 36%)";
  if (token.program === "complexflex") return "hsl(262 62% 46%)";
  return "hsl(46 88% 42%)";
}

export function BubblesView({ tokens, size, chg, extras }: WinnerViewProps) {
  const items: LiveBubbleItem[] = tokens.map((t) => {
    const extra = extras?.get(t.id);
    return {
      id: t.id,
      value: bubbleValue(t, size, extra, chg),
      label: t.pre ? `${t.symbol} PRE` : t.symbol,
      sub: formatSize(t, size, extra, chg),
      to: `/token/${t.contract}/${t.symbol}`,
      color: fillFor(t, extra, chg, size),
    };
  });
  return (
    <LiveBubbles
      items={items}
      className="relative mt-8 h-[min(72vh,640px)] overflow-hidden border border-border bg-[#0d0d0d]"
    />
  );
}
