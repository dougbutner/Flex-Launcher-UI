import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Composer } from "@/components/insiders/Composer";
import { FeedPost } from "@/components/insiders/FeedPost";
import { TokenIcon } from "@/components/TokenIcon";
import { MON3Y } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { createPost, fetchFeed, recordUp, type InsiderPost } from "@/services/insidersApi";
import { easyQuantity, effectiveAuthorScore, type FeedRange } from "@/services/insidersRules";
import {
  actorHoldsToken,
  countTokenTxs24h,
  loadLaunchRooms,
  loadTokenMetrics,
  type LaunchRoom,
  type TokenMetrics,
} from "@/services/mechanicsLive";
import { scoreParts } from "@/services/mechanicsScore";
import { txErrorMessage, txIdFromResult } from "@/services/txParse";

const RANGES: FeedRange[] = ["day", "week", "month", "year", "all"];
const RANGE_LABEL: Record<FeedRange, string> = {
  day: "Today",
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All",
};

export default function Insiders() {
  const { contract = "", symbol = "" } = useParams<{ contract?: string; symbol?: string }>();
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  const { actor, isLoggedIn, transact } = useWallet();

  const [rooms, setRooms] = useState<LaunchRoom[] | null>(null);
  const [posts, setPosts] = useState<InsiderPost[]>([]);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [upsEasy, setUpsEasy] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [txByAuthor, setTxByAuthor] = useState<Record<string, number>>({});
  const [holds, setHolds] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [range, setRange] = useState<FeedRange>("day");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const liveRooms = useMemo(() => (rooms ?? []).filter((r) => r.launched), [rooms]);
  const room = liveRooms.find((r) => r.contract === code && r.symbol === sym) ?? null;
  const pending = (rooms ?? []).find((r) => r.contract === code && r.symbol === sym && !r.launched) ?? null;

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
  }, [code, sym, actor]);

  const refreshFeed = useCallback(async () => {
    if (!code || !sym) return;
    const feed = await fetchFeed(code, sym, { range });
    setPosts(feed.posts);
    setActivity(feed.activity);
    setUpsEasy(feed.upsEasy);
  }, [code, sym, range]);

  useEffect(() => {
    if (!room) {
      setPosts([]);
      setMetrics(null);
      return;
    }
    let live = true;
    setBusy(true);
    setError("");
    void Promise.all([refreshFeed(), loadTokenMetrics(room.contract, room.symbol, room.poolId)])
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
  }, [refreshFeed, room]);

  useEffect(() => {
    if (!room) return;
    const authors = [...new Set(posts.map((p) => p.author))];
    let live = true;
    void Promise.all(authors.map(async (a) => [a, await countTokenTxs24h(a, room.contract, room.symbol)] as const)).then(
      (pairs) => {
        if (!live) return;
        const next: Record<string, number> = {};
        for (const [a, n] of pairs) next[a] = n;
        setTxByAuthor(next);
      }
    );
    return () => {
      live = false;
    };
  }, [posts, room]);

  const liveScoreOf = (account: string) => {
    const owner = account.toLowerCase();
    const rank = metrics?.ranks.get(owner) ?? null;
    const userLiq = metrics?.lpByOwner.get(owner) ?? 0;
    return scoreParts({
      rank,
      userLiq,
      totalLiq: metrics?.totalLiq ?? 0,
      messages24h: activity[owner] ?? 0,
      txs24h: txByAuthor[owner] ?? 0,
      ups24h: upsEasy[owner] ?? 0,
    }).total;
  };

  const sortScoreOf = (account: string, stored: number) =>
    effectiveAuthorScore(stored, upsEasy[account.toLowerCase()] ?? 0);

  const holdOf = (account: string) => {
    const raw = metrics?.holdByOwner.get(account.toLowerCase());
    if (!(raw && raw > 0)) return "";
    const rank = metrics?.ranks.get(account.toLowerCase());
    const amt = raw.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return rank ? `#${rank} · ${amt} ${sym}` : `${amt} ${sym}`;
  };

  const sorted = useMemo(() => {
    return [...posts].sort(
      (a, b) => sortScoreOf(b.author, b.authorScore) - sortScoreOf(a.author, a.authorScore) || b.createdAt - a.createdAt
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, upsEasy]);

  const myScore = actor ? liveScoreOf(actor) : 0;
  const canWrite = Boolean(isLoggedIn && verified && holds);

  const verify = async () => {
    if (!room || !actor) return;
    setVerifyBusy(true);
    setError("");
    try {
      const held = await actorHoldsToken(room.contract, room.symbol, actor);
      setHolds(held);
      setVerified(true);
      if (!held) setError("Holders only for now. Pre-launch Insiders access is next.");
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

  return (
    <div className="insiders mx-auto max-w-xl px-4 py-8 sm:px-6">
      <h1 className="insiders-title">Insiders</h1>
      <p className="insiders-muted mt-2">
        Public feed. Holders post once per UTC day. Sort is mechanics score (hold 50, main LP 30, 24h activity 20) plus
        EASY UP.
      </p>

      <ul className="insiders-rail">
        {liveRooms.map((r) => {
          const on = r.contract === code && r.symbol === sym;
          return (
            <li key={`${r.contract}:${r.symbol}`}>
              <Link to={`/insiders/${r.contract}/${r.symbol}`} className={on ? "is-on" : ""}>
                <TokenIcon contract={r.contract} symbol={r.symbol} size={22} />
                <span className="insiders-rail-sym">${r.symbol}</span>
                <span className="insiders-rail-meta">{r.program === "core" ? "flex" : r.contract}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {!code || !sym ? (
        <p className="insiders-muted mt-8">{rooms == null ? "Reading rooms…" : "Pick a live token."}</p>
      ) : pending ? (
        <div className="insiders-muted mt-8 border border-border p-6">
          ${sym} is still in the wizard. Insiders before launch will sit here. For now the room opens at liftoff.
        </div>
      ) : !room && rooms ? (
        <p className="insiders-muted mt-8">
          No launched token at {code}/{sym}.
        </p>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Link to={`/token/${code}/${sym}`} className="insiders-title text-2xl">
              ${sym}
            </Link>
            <Link to="/events" className="btn btn-ghost btn-sm">
              Events
            </Link>
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

          {busy ? <p className="insiders-muted mt-4">Opening room…</p> : null}
          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          <div className="insiders-verify">
            {isLoggedIn && actor ? (
              <>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void verify()} disabled={verifyBusy}>
                  {verifyBusy ? "Checking…" : verified ? (holds ? `Verified · ${myScore}` : "Not a holder") : "Verify status"}
                </button>
                {verified && holds ? (
                  <span className="insiders-muted">Score {myScore}. One post per UTC day.</span>
                ) : (
                  <span className="insiders-muted">Verify holdings before posting. Anyone can read.</span>
                )}
              </>
            ) : (
              <span className="insiders-muted">Connect to verify and post. Feed stays public.</span>
            )}
          </div>

          {canWrite ? (
            <div className="mt-4">
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
                  await refreshFeed();
                }}
              />
            </div>
          ) : null}

          <div className="mt-4">
            {sorted.length === 0 && !busy ? (
              <p className="insiders-muted py-8 text-center">No posts in this range.</p>
            ) : (
              sorted.map((p) => (
                <FeedPost
                  key={p.id}
                  post={p}
                  scoreOf={(a, stored) => sortScoreOf(a, stored)}
                  holdOf={holdOf}
                  contract={code}
                  symbol={sym}
                  actor={actor}
                  canWrite={canWrite}
                  lockedReason="Verify as a holder to reply."
                  authorScore={actor ? myScore : 0}
                  onPosted={() => void refreshFeed()}
                  onUp={async (post, whole) => {
                    try {
                      return await sendUp(post, whole);
                    } catch (e) {
                      throw new Error(txErrorMessage(e));
                    }
                  }}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
