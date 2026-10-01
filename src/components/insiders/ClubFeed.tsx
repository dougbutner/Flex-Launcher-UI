import { useCallback, useEffect, useState } from "react";
import { Composer } from "@/components/insiders/Composer";
import { FeedPost } from "@/components/insiders/FeedPost";
import { HolderProfile } from "@/components/insiders/HolderCard";
import { MON3Y } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { createPost, fetchFeed, recordUp, type InsiderPost } from "@/services/insidersApi";
import { actorClubMark, clubKey, loadClubMarks, type ClubMark } from "@/services/insidersClub";
import { easyQuantity, type FeedRange } from "@/services/insidersRules";
import { actorHoldsToken, loadTokenMetrics, type TokenMetrics } from "@/services/mechanicsLive";
import { readInsiders } from "@/services/flexTables";
import { txErrorMessage, txIdFromResult } from "@/services/txParse";
import { FeedSkeleton } from "@/components/ui/PageSkeletons";
import { Pulse } from "@/components/ui/Pulse";

const RANGES: FeedRange[] = ["day", "week", "month", "year", "all"];
const RANGE_LABEL: Record<FeedRange, string> = {
  day: "Today",
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All",
};

export function ClubFeed({
  contract,
  symbol,
  poolId,
  initialRange = "day",
}: {
  contract: string;
  symbol: string;
  poolId: number;
  initialRange?: FeedRange;
}) {
  const { actor, isLoggedIn, transact, login, addAnchorWallet } = useWallet();
  const [posts, setPosts] = useState<InsiderPost[]>([]);
  const [upsEasy, setUpsEasy] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [clubMarks, setClubMarks] = useState<Record<string, ClubMark>>({});
  const [holds, setHolds] = useState(false);
  const [myClub, setMyClub] = useState<ClubMark | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [range, setRange] = useState<FeedRange>(initialRange);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [profile, setProfile] = useState<string | null>(null);

  useEffect(() => {
    setVerified(false);
    setHolds(false);
    setMyClub(null);
    setProfile(null);
  }, [contract, symbol, actor]);

  const refresh = useCallback(async () => {
    const roomFeed = await fetchFeed(contract, symbol, { range });
    setPosts(roomFeed.posts);
    setUpsEasy(roomFeed.upsEasy);
  }, [contract, symbol, range]);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError("");
    void Promise.all([refresh(), loadTokenMetrics(contract, symbol, poolId).catch(() => null)])
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
  }, [refresh, contract, symbol, poolId]);

  useEffect(() => {
    let live = true;
    void loadClubMarks([{ contract, symbol }]).then((marks) => {
      if (live) setClubMarks(marks);
    });
    return () => {
      live = false;
    };
  }, [contract, symbol]);

  const holdOf = (account: string) => metrics?.holdByOwner.get(account.toLowerCase()) ?? 0;
  const clubOf = (account: string, c: string, s: string): ClubMark | null =>
    clubMarks[clubKey(c, s, account)] ?? null;
  const canWrite = Boolean(isLoggedIn && verified && (holds || myClub));
  const myScore = 0;

  const verify = async () => {
    if (!actor) return;
    setVerifyBusy(true);
    setError("");
    try {
      const [held, rows] = await Promise.all([
        actorHoldsToken(contract, symbol, actor),
        readInsiders(contract, symbol).catch(() => [] as Record<string, unknown>[]),
      ]);
      const mark = actorClubMark(rows, actor);
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

  const verifyLabel = (() => {
    if (verifyBusy) return "…";
    if (!verified) return "verify";
    if (myClub === "proven") return "verified proven";
    if (myClub === "insider") return "verified insider";
    if (holds) return "verified holder";
    return "not a holder";
  })();

  const profileMark = profile ? clubOf(profile, contract, symbol) : null;

  return (
    <div className="insiders min-h-0">
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
                symbol={symbol}
                onSubmit={async (body, captchaId, captchaAnswer, giphyUrl) => {
                  if (!actor) return;
                  await createPost({
                    contract,
                    symbol,
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
            ) : null}
          </>
        ) : (
          <button type="button" className="insiders-quiet" onClick={onNeedConnect}>
            connect to post
          </button>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {busy && !posts.length ? <FeedSkeleton /> : null}

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
        {!busy && !posts.length ? <p className="insiders-muted">No posts yet.</p> : null}
        {posts.map((p) => (
          <FeedPost
            key={p.id}
            post={p}
            holdOf={holdOf}
            actor={actor}
            canWrite={canWrite}
            lockedReason="Verify as a holder or on-chain insider to reply."
            authorScore={myScore}
            onPosted={() => void refresh()}
            onUp={async (post, whole) => {
              try {
                return await sendUp(post, whole);
              } catch (e) {
                throw new Error(txErrorMessage(e));
              }
            }}
            onNeedConnect={onNeedConnect}
            onOpenProfile={setProfile}
            clubOf={clubOf}
          />
        ))}
      </div>

      <p className="insiders-foot">
        {range === "day" ? "Daily feed." : range === "all" ? "All posts." : `${RANGE_LABEL[range]} feed.`} Holders or
        on-chain insiders post once per UTC day. Gold badge is on-chain (approved, or proven after lock proof). Tap a
        holding to open the profile.
      </p>

      {profile ? (
        <HolderProfile
          account={profile}
          contract={contract}
          symbol={symbol}
          amount={holdOf(profile)}
          clubMark={profileMark}
          onClose={() => setProfile(null)}
        />
      ) : null}
    </div>
  );
}

/** Highest post this week across every flex token. Same card as the room feed. */
export function WeekTopPost() {
  const { actor, isLoggedIn, transact, login, addAnchorWallet } = useWallet();
  const [post, setPost] = useState<InsiderPost | null>(null);
  const [hold, setHold] = useState(0);
  const [marks, setMarks] = useState<Record<string, ClubMark>>({});
  const [busy, setBusy] = useState(true);
  const [profile, setProfile] = useState(false);
  const [open, setOpen] = useState(true);

  const refresh = useCallback(async () => {
    const feed = await fetchFeed("", "", { range: "week", global: true });
    const top = feed.posts[0] ?? null;
    setPost(top);
    if (!top) {
      setHold(0);
      setMarks({});
      return;
    }
    const [metrics, club] = await Promise.all([
      loadTokenMetrics(top.contract, top.symbol, 0).catch(() => null),
      loadClubMarks([{ contract: top.contract, symbol: top.symbol }]),
    ]);
    setHold(metrics?.holdByOwner.get(top.author.toLowerCase()) ?? 0);
    setMarks(club);
  }, []);

  useEffect(() => {
    let live = true;
    setBusy(true);
    void refresh()
      .catch(() => {
        if (live) setPost(null);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [refresh]);

  const onNeedConnect = () => {
    void login().catch(() => addAnchorWallet());
  };

  const sendUp = async (row: InsiderPost, whole: number) => {
    if (!actor) throw new Error("Connect a wallet to UP.");
    const quantity = easyQuantity(whole);
    const res = await transact([
      {
        account: MON3Y,
        name: "transfer",
        data: { from: actor, to: row.author, quantity, memo: `up#${row.id}` },
      },
    ]);
    const txid = txIdFromResult(res);
    if (!txid || txid === "ok") throw new Error("No tx hash. Stay connected and try again.");
    await recordUp({ postId: row.id, from: actor, amountRaw: whole, quantity, txid });
    return txid;
  };

  const mark = post ? (marks[clubKey(post.contract, post.symbol, post.author)] ?? null) : null;

  return (
      <div className="insiders mt-4">
      <div className="insiders-ranges">
        <button
          type="button"
          className="is-on"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Hot This Week
        </button>
      </div>
      {open && busy ? (
        <div className="mt-2 space-y-2 border-b border-border/80 pb-3" aria-busy="true">
          <div className="flex items-center gap-2">
            <Pulse className="h-6 w-6 rounded-full" />
            <Pulse className="h-3 w-24" />
          </div>
          <Pulse className="h-3 w-full" />
          <Pulse className="h-3 w-2/3" />
        </div>
      ) : open && post ? (
        <div className="mt-2">
          <FeedPost
            post={post}
            holdOf={() => hold}
            actor={isLoggedIn ? actor : null}
            canWrite={false}
            lockedReason=""
            authorScore={0}
            onPosted={() => void refresh()}
            onUp={async (row, whole) => {
              try {
                return await sendUp(row, whole);
              } catch (e) {
                throw new Error(txErrorMessage(e));
              }
            }}
            onNeedConnect={onNeedConnect}
            onOpenProfile={() => setProfile(true)}
            clubOf={(account, contract, symbol) => marks[clubKey(contract, symbol, account)] ?? null}
          />
        </div>
      ) : open ? (
        <p className="insiders-muted mt-2">No posts this week.</p>
      ) : null}
      {open ? <p className="insiders-foot">Highest post this week across flex tokens.</p> : null}
      {profile && post ? (
        <HolderProfile
          account={post.author}
          contract={post.contract}
          symbol={post.symbol}
          amount={hold}
          clubMark={mark}
          onClose={() => setProfile(false)}
        />
      ) : null}
    </div>
  );
}
