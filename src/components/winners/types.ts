import type { BoardToken } from "@/services/leaderboardStore";
import type { BubbleSizeId, ChangeWindowId, WinnerExtra } from "@/services/winnerViews";

export type WinnerViewProps = {
  tokens: BoardToken[];
  size: BubbleSizeId;
  chg: ChangeWindowId;
  extras: Map<string, WinnerExtra> | null;
  extrasBusy?: boolean;
};
