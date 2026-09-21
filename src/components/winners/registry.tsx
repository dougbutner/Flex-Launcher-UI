import { lazy, Suspense, type ComponentType } from "react";
import { BubblesView } from "@/components/winners/BubblesView";
import { TilesView } from "@/components/winners/TilesView";
import { BoardSkeleton } from "@/components/winners/WinnerSkeleton";
import type { WinnerViewProps } from "@/components/winners/types";
import type { WinnerViewId } from "@/services/winnerViews";

const LazyBoard = lazy(() => import("@/components/winners/BoardView"));

function BoardView(props: WinnerViewProps) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <LazyBoard {...props} />
    </Suspense>
  );
}

/** Add a row here to register a new Winners display. Label is the header text link. */
export const WINNER_VIEWS: Array<{
  id: WinnerViewId;
  label: string;
  View: ComponentType<WinnerViewProps>;
}> = [
  { id: "tiles", label: "Tiles", View: TilesView },
  { id: "bubbles", label: "Bubbles", View: BubblesView },
  { id: "board", label: "Board", View: BoardView },
];
