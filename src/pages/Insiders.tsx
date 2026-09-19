import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Composer } from "@/components/insiders/Composer";
import { FeedPost } from "@/components/insiders/FeedPost";
import { TokenIcon } from "@/components/TokenIcon";
import { MON3Y } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { createPost, fetchFeed, recordUp, type InsiderPost } from "@/services/insidersApi";
import { easyQuantity, effectiveAuthorScore, splitFeatured, type FeedRange } from "@/services/insidersRules";
import {
  actorHoldsToken,
  countTokenTxs24h,
  loadLaunchRooms,
  loadTokenMetrics,
  type LaunchRoom,
  type TokenMetrics,
} from "@/services/mechanicsLive";
import { scoreParts } from "@/services/mechanicsScore";
import { clubKey, clubMarkOf, loadClubMarks, type ClubMark } from "@/services/insidersClub";
import { readInsiders } from "@/services/flexTables";
import { txErrorMessage, txIdFromResult } from "@/services/txParse";

const RANGES: FeedRange[] = ["day", "week", "month", "year", "all"];
const RANGE_LABEL: Record<FeedRange, string> = {
  day: "Today",
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All",
};

function listPosts(
  posts: InsiderPost[],
  totalOf: (account: string, stored: number) => number,
  upsOf: (account: string) => number,
  actor: string | null,
  canWrite: boolean,
  myScore: number,
  refresh: () => void,
  sendUp: (post: InsiderPost, whole: number) => Promise<string>,
  onNeedConnect: () => void,
  clubOf: (account: string, contract: string, symbol: string) => ClubMark | null
) {
  return posts.map((p) => (
    <FeedPost
      key={p.id}
      post={p}
      totalOf={totalOf}
      upsOf={upsOf}
      actor={actor}
      canWrite={canWrite}
      lockedReason="Verify as a holder or on-chain insider to reply."
      authorScore={actor ? myScore : 0}
      onPosted={refresh}
      onUp={sendUp}
      onNeedConnect={onNeedConnect}
      clubOf={clubOf}
    />
  ));
}

export default function Insiders() {
  const { contract = "", symbol = "" } = useParams<{ contract?: string; symbol?: string }>();
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  const { actor, isLoggedIn, transact, login, addAnchorWallet } = useWallet();

  const [rooms, setRooms] = useState<LaunchRoom[] | null>(null);
  const [globalPosts, setGlobalPosts] = useState<InsiderPost[]>([]);
  const [roomPosts, setRoomPosts] = useState<InsiderPost[]>([]);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [upsEasy, setUpsEasy] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [txByAuthor, setTxByAuthor] = useState<Record<string, number>>({});
  const [holds, setHolds] = useState(false);
  const [clubMarks, setClubMarks] = useState<Record<string, ClubMark>>({});
  const [myClub, setMyClub] = useState<ClubMark | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [range, setRange] = useState<FeedRange>("day");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const liveRooms = useMemo(() => (rooms ?? []).filter((r) => r.launched || r.poolId > 0), [rooms]);
  const room = liveRooms.find((r) => r.contract === code && r.symbol === sym) ?? null;
  const pending = (rooms ?? []).find((r) => r.contract === code && r.symbol === sym && !r.launched && r.poolId <= 0) ?? null;

  useEffect(() => {
    let live = true;
    loadLaunchRooms()
      .then((rows) => {
        if (live) setRooms(rows);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setVerified(false);
    setHolds(false);
    setMyClub(null);
  }, [code, sym, actor]);

  useEffect(() => {
    if (!liveRooms.length) {
      setClubMarks({});
      return;
    }
    let live = true;
    void loadClubMarks(liveRooms.filter((r) => r.program !== "core")).then((marks) => {
      if (live) setClubMarks(marks);
    });
    return () => {
      live = false;
    };
  }, [liveRooms]);

  const refresh = useCallback(async () => {
    const [top, roomFeed] = await Promise.all([
      fetchFeed("", "", { global: true, range: "day" }),
      room ? fetchFeed(room.contract, room.symbol, { range }) : Promise.resolve(null),
    ]);
    setGlobalPosts(top.posts);
    setActivity(top.activity);
    setUpsEasy(top.upsEasy);
    if (roomFeed) {
      setRoomPosts(roomFeed.posts);
      setActivity((a) => ({ ...a, ...roomFeed.activity }));
      setUpsEasy((u) => ({ ...u, ...roomFeed.upsEasy }));
    } else {
      setRoomPosts([]);
    }
  }, [room, range]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    const metricsP = room
      ? loadTokenMetrics(room.contract, room.symbol, room.poolId)
      : Promise.resolve(null);
    void Promise.all([refresh(), metricsP])
      .then(([, m]) => {
        if (!live) return;
        setMetrics(m);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [refresh, room]);

  useEffect(() => {
    const authors = [...new Set([...globalPosts, ...roomPosts].map((p) => p.author))];
    if (!authors.length) return;
    let live = true;
    void Promise.all(
      authors.map(async (a) => {
        const c = room?.contract || "";
        const s = room?.symbol || "";
        return [a, c && s ? await countTokenTxs24h(a, c, s) : 0] as const;
      })
    ).then((pairs) => {
      if (!live) return;
      const next: Record<string, number> = {};
      for (const [a, n] of pairs) next[a] = n;
      setTxByAuthor(next);
    });
    return () => {
      live = false;
    };
  }, [globalPosts, roomPosts, room]);

  const liveScoreOf = (account: string) => {
    const owner = account.toLowerCase();
    return scoreParts({
      rank: metrics?.ranks.get(owner) ?? null,
      userLiq: metrics?.lpByOwner.get(owner) ?? 0,
      totalLiq: metrics?.totalLiq ?? 0,
      messages24h: activity[owner] ?? 0,
      txs24h: txByAuthor[owner] ?? 0,
      ups24h: upsEasy[owner] ?? 0,
    }).total;
  };

  const totalOf = (account: string, stored: number) =>
    effectiveAuthorScore(stored, upsEasy[account.toLowerCase()] ?? 0);
  const upsOf = (account: string) => upsEasy[account.toLowerCase()] ?? 0;

  const featured = useMemo(() => splitFeatured(globalPosts).featured, [globalPosts]);
  const featuredIds = useMemo(() => new Set(featured.map((p) => p.id)), [featured]);
  const rest = useMemo(() => {
    const pool = room ? roomPosts : splitFeatured(globalPosts).rest;
    return pool.filter((p) => !featuredIds.has(p.id));
  }, [room, roomPosts, globalPosts, featuredIds]);

  const myScore = actor ? liveScoreOf(actor) : 0;
  const clubOf = (account: string, contract: string, symbol: string): ClubMark | null =>
    clubMarks[clubKey(contract, symbol, account)] ?? null;
  const canWrite = Boolean(isLoggedIn && verified && (holds || myClub) && room);

  const verify = async () => {
    if (!room || !actor) return;
    setVerifyBusy(true);
    setError("");
    try {
      const [held, rows] = await Promise.all([
        actorHoldsToken(room.contract, room.symbol, actor),
        readInsiders(room.contract, room.symbol).catch(() => [] as Record<string, unknown>[]),
      ]);
      const mine = rows.find((r) => String(r.account ?? "").toLowerCase() === actor.toLowerCase());
      const mark = clubMarkOf(mine);
      setHolds(held);
      setMyClub(mark);
      setVerified(true);
      if (!held && !mark) setError("Holders or on-chain insiders can post.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifyBusy(false);
    }
  };

  const sendUp = async (post: InsiderPost, whole: number) => {
    if (!actor) throw new Error("Connect a wallet to UP.");
    const quantity = easyQuantity(whole);
    const res = await transact([
      {
        account: MON3Y,
        name: "transfer",
        data: {
          from: actor,
          to: post.author,
          quantity,
          memo: `up#${post.id}`,
        },
      },
    ]);
    const txid = txIdFromResult(res);
    if (!txid || txid === "ok") throw new Error("No tx hash. Stay connected and try again.");
    await recordUp({ postId: post.id, from: actor, amountRaw: whole, quantity, txid });
    return txid;
  };

  const onNeedConnect = () => {
    void login().catch(() => addAnchorWallet());
  };

  const postProps = {
    totalOf,
    upsOf,
    actor,
    canWrite,
    myScore,
    refresh: () => void refresh(),
    sendUp: async (post: InsiderPost, whole: number) => {
      try {
        return await sendUp(post, whole);
      } catch (e) {
        throw new Error(txErrorMessage(e));
      }
    },
    onNeedConnect,
    clubOf,
  };

  const verifyLabel = (() => {
    if (verifyBusy) return "…";
    if (!verified) return "verify";
    if (myClub === "proven") return `verified proven ${myScore}`;
    if (myClub === "insider") return `verified insider ${myScore}`;
    if (holds) return `verified ${myScore}`;
    return "not a holder";
  })();

  return (
    <div className="insiders mx-auto max-w-xl px-4 pb-8 pt-16 sm:px-6">
      <ul className="insiders-rail">
        {liveRooms.map((r) => {
          const on = r.contract === code && r.symbol === sym;
          return (
            <li key={`${r.contract}:${r.symbol}`}>
              <Link to={`/insiders/${r.contract}/${r.symbol}`} className={on ? "is-on" : ""}>
                <TokenIcon contract={r.contract} symbol={r.symbol} size={16} />
                <span className="insiders-rail-sym">${r.symbol}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {pending ? (
        <p className="insiders-muted mt-4">${sym} opens after lock and liftoff.</p>
      ) : code && sym && !room && rooms ? (
        <p className="insiders-muted mt-4">
          No launched or club token at {code}/{sym}.
        </p>
      ) : null}

      {room ? (
        <div className="insiders-verify">
          {isLoggedIn && actor ? (
            <>
              <button type="button" className="insiders-quiet" onClick={() => void verify()} disabled={verifyBusy}>
                {verifyLabel}
              </button>
              {verified && myClub ? (
                <span className="insiders-club-badge">{myClub === "proven" ? "proven" : "insider"}</span>
              ) : null}
              {canWrite ? (
                <Composer
                  actor={actor}
                  canPost
                  lockedReason=""
                  submitLabel="Post"
                  symbol={sym}
                  onSubmit={async (body, captchaId, captchaAnswer, giphyUrl) => {
                    if (!actor) return;
                    await createPost({
                      contract: code,
                      symbol: sym,
                      actor,
                      body,
                      captchaId,
                      captchaAnswer,
                      giphyUrl,
                      authorScore: myScore,
                    });
                    await refresh();
                  }}
                />
              ) : (
                <span className="insiders-muted">verify to post</span>
              )}
            </>
          ) : (
            <button type="button" className="insiders-quiet" onClick={onNeedConnect}>
              connect to post
            </button>
          )}
        </div>
      ) : (
        <p className="insiders-muted mt-4">Pick a token to post.</p>
      )}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {busy && !featured.length && !rest.length ? <p className="insiders-muted mt-4">…</p> : null}

      <div className="mt-4">
        {listPosts(
          featured,
          postProps.totalOf,
          postProps.upsOf,
          postProps.actor,
          postProps.canWrite,
          postProps.myScore,
          postProps.refresh,
          postProps.sendUp,
          postProps.onNeedConnect,
          postProps.clubOf
        )}
      </div>

      <div className="insiders-ranges" role="tablist" aria-label="Feed range">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            className={range === r ? "is-on" : ""}
            onClick={() => setRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {listPosts(
          rest,
          postProps.totalOf,
          postProps.upsOf,
          postProps.actor,
          postProps.canWrite,
          postProps.myScore,
          postProps.refresh,
          postProps.sendUp,
          postProps.onNeedConnect,
          postProps.clubOf
        )}
      </div>

      <p className="insiders-foot">
        Public feed. Holders or on-chain insiders post once per UTC day. Sort is mechanics score (hold 50, main LP 30, 24h
        activity 20) plus EASY UP. Gold badge is on-chain (approved, or proven after lock proof).
      </p>
    </div>
  );
}
