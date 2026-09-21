import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BubblesSkeleton, TilesSkeleton, BoardSkeleton } from "@/components/winners/WinnerSkeleton";
import { WinnerTextLink } from "@/components/winners/WinnerTextLink";
import { WINNER_VIEWS } from "@/components/winners/registry";
import { loadBoardTokens, type BoardToken } from "@/services/leaderboardStore";
import { loadProtonTokenTable } from "@/services/tokenProton";
import { loadWinnerExtras } from "@/services/winnerExtras";
import {
  extrasNeeded,
  parseWinnerView,
  winnerViewSearch,
  type BubbleSizeId,
  type ChangeWindowId,
  type WinnerExtra,
  type WinnerViewId,
} from "@/services/winnerViews";

const SIZE_LINKS: Array<{ id: BubbleSizeId; label: string }> = [
  { id: "liq", label: "Locked liq" },
  { id: "volume", label: "Volume" },
  { id: "mcap", label: "Cap" },
  { id: "change", label: "Change" },
  { id: "holders", label: "Holders" },
];

const CHG_LINKS: Array<{ id: ChangeWindowId; label: string }> = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "Month" },
];

export default function Leaderboard() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parseWinnerView(params), [params]);
  const [tokens, setTokens] = useState<BoardToken[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [extras, setExtras] = useState<Map<string, WinnerExtra> | null>(null);
  const [extrasBusy, setExtrasBusy] = useState(false);

  const setView = (patch: Partial<{ view: WinnerViewId; size: BubbleSizeId; chg: ChangeWindowId }>) => {
    const next = { ...state, ...patch };
    const q = winnerViewSearch(next);
    setParams(q ? new URLSearchParams(q.slice(1)) : new URLSearchParams(), { replace: true });
  };

  useEffect(() => {
    let live = true;
    void loadProtonTokenTable().catch(() => []);
    loadBoardTokens()
      .then((rows) => {
        if (!live) return;
        setTokens(rows);
      })
      .catch((e) => {
        if (!live) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/retrieve account|unknown key|not.*live/i.test(msg)) {
          setTokens([]);
          setNotice("Flex contracts are not live yet. Launches will appear here after the first liftoff.");
        } else {
          setError(msg);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!tokens || !extrasNeeded(state)) {
      setExtrasBusy(false);
      return;
    }
    const have = extras;
    if (have && tokens.every((t) => t.poolId <= 0 || have.has(t.id))) {
      setExtrasBusy(false);
      return;
    }
    let live = true;
    setExtrasBusy(true);
    loadWinnerExtras(tokens)
      .then((rows) => {
        if (!live) return;
        setExtras(rows);
      })
      .finally(() => {
        if (live) setExtrasBusy(false);
      });
    return () => {
      live = false;
    };
  }, [tokens, extras, state.view, state.size]);

  const active = WINNER_VIEWS.find((v) => v.id === state.view) ?? WINNER_VIEWS[0];
  const View = active.View;
  const needExtras = extrasNeeded(state);
  const showBubbleSkeleton = state.view === "bubbles" && (tokens == null || (needExtras && extrasBusy && !extras));
  const boardPending = state.view === "board" && tokens == null;

  return (
    <div className={`mx-auto px-4 py-8 sm:px-6 ${state.view === "board" ? "max-w-[90rem]" : "max-w-7xl"}`}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <h1 className="text-3xl font-black tracking-tight">Winners</h1>
        {WINNER_VIEWS.map((v) => (
          <WinnerTextLink key={v.id} label={v.label} active={state.view === v.id} onClick={() => setView({ view: v.id })} />
        ))}
      </div>

      {state.view === "bubbles" ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          {SIZE_LINKS.map((s) => (
            <WinnerTextLink key={s.id} label={s.label} active={state.size === s.id} onClick={() => setView({ size: s.id })} />
          ))}
        </div>
      ) : null}
      {state.view === "bubbles" && state.size === "change" ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          {CHG_LINKS.map((c) => (
            <WinnerTextLink key={c.id} label={c.label} active={state.chg === c.id} onClick={() => setView({ chg: c.id })} />
          ))}
        </div>
      ) : null}

      {state.view !== "board" ? (
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          {state.view === "bubbles"
            ? state.size === "change"
              ? "Bubble size is absolute percent change. Green is up, red is down. Pick 24h, 7d, or month."
              : state.size === "volume"
                ? "Bubble size is 24h Alcor volume on the launch pair."
                : state.size === "mcap"
                  ? "Bubble size is market cap."
                  : state.size === "holders"
                    ? "Bubble size is holder count on the flexer book."
                    : "Bubble size is locked liquidity in the launch pool."
            : "Live flex launches ranked by freshness, volume, cap, and holders. Open a tile for the token page."}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">{notice}</p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p>
      ) : boardPending ? (
        <BoardSkeleton />
      ) : tokens == null && state.view === "tiles" ? (
        <TilesSkeleton />
      ) : showBubbleSkeleton ? (
        <BubblesSkeleton />
      ) : tokens == null ? (
        <TilesSkeleton />
      ) : tokens.length === 0 ? (
        <div className="card mt-6 p-8 text-center text-sm text-muted-foreground">
          No live launches yet. Be the first. Hit the Launch wizard.
        </div>
      ) : (
        <View tokens={tokens} size={state.size} chg={state.chg} extras={extras} extrasBusy={extrasBusy} />
      )}
    </div>
  );
}
