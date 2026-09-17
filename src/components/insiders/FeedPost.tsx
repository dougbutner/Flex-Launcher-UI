import { useState } from "react";
import { AccountFace } from "@/components/insiders/AccountFace";
import { Composer } from "@/components/insiders/Composer";
import { UpButton } from "@/components/insiders/UpButton";
import { TxLink } from "@/components/launch/ui";
import { createPost, fetchFeed, type InsiderPost } from "@/services/insidersApi";

function ago(ms: number) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function FeedPost({
  post,
  scoreOf,
  holdOf,
  contract,
  symbol,
  actor,
  canWrite,
  lockedReason,
  authorScore,
  onPosted,
  onUp,
  depth = 0,
}: {
  post: InsiderPost;
  scoreOf: (account: string, stored: number) => number;
  holdOf?: (account: string) => string;
  contract: string;
  symbol: string;
  actor: string | null;
  canWrite: boolean;
  lockedReason: string;
  authorScore: number;
  onPosted: () => void;
  onUp: (post: InsiderPost, whole: number) => Promise<string>;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState<InsiderPost[] | null>(null);
  const [txid, setTxid] = useState("");

  const loadReplies = () => {
    void fetchFeed(contract, symbol, { parentId: post.id })
      .then((res) => setReplies(res.posts))
      .catch(() => setReplies([]));
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && replies == null) loadReplies();
  };

  return (
    <article className={depth ? "insiders-reply" : "insiders-post"}>
      <AccountFace account={post.author} score={scoreOf(post.author, post.authorScore)} holdLabel={holdOf?.(post.author)} />
      <p className="insiders-body">{post.body}</p>
      {post.giphyUrl ? <img src={post.giphyUrl} alt="" className="insiders-post-gif" /> : null}
      <div className="insiders-actions">
        <span>{ago(post.createdAt)}</span>
        <button type="button" className="link" onClick={toggle}>
          {open ? "Hide" : `${post.replyCount} ${post.replyCount === 1 ? "reply" : "replies"}`}
        </button>
        {canWrite ? (
          <button type="button" className="link" onClick={() => setReplying((v) => !v)}>
            {replying ? "Close" : "Reply"}
          </button>
        ) : null}
        <span>
          {post.upCount} UP · {post.upEasy} EASY
        </span>
        {actor && actor !== post.author ? (
          <UpButton
            onCommit={async (whole) => {
              const id = await onUp(post, whole);
              setTxid(id);
              onPosted();
            }}
          />
        ) : null}
        {txid ? <TxLink tx={txid} prefix="tx " /> : null}
      </div>
      {replying ? (
        <div className="mt-2">
          <Composer
            actor={actor}
            canPost={canWrite}
            lockedReason={lockedReason}
            submitLabel="Reply"
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
                parentId: post.id,
                giphyUrl,
                authorScore,
              });
              setReplying(false);
              setOpen(true);
              loadReplies();
              onPosted();
            }}
          />
        </div>
      ) : null}
      {open ? (
        <div className="insiders-thread">
          {replies == null ? <p className="insiders-muted">Loading replies…</p> : null}
          {replies?.map((r) => (
            <FeedPost
              key={r.id}
              post={r}
              scoreOf={scoreOf}
              holdOf={holdOf}
              contract={contract}
              symbol={symbol}
              actor={actor}
              canWrite={canWrite}
              lockedReason={lockedReason}
              authorScore={authorScore}
              onPosted={onPosted}
              onUp={onUp}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
