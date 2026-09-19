import { useState } from "react";
import { AccountFace } from "@/components/insiders/AccountFace";
import { Composer } from "@/components/insiders/Composer";
import { UpButton } from "@/components/insiders/UpButton";
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
  totalOf,
  upsOf,
  actor,
  canWrite,
  lockedReason,
  authorScore,
  onPosted,
  onUp,
  onNeedConnect,
  clubOf,
  depth = 0,
}: {
  post: InsiderPost;
  totalOf: (account: string, stored: number) => number;
  upsOf: (account: string) => number;
  actor: string | null;
  canWrite: boolean;
  lockedReason: string;
  authorScore: number;
  onPosted: () => void;
  onUp: (post: InsiderPost, whole: number) => Promise<string>;
  onNeedConnect?: () => void;
  clubOf?: (account: string, contract: string, symbol: string) => "insider" | "proven" | null;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState<InsiderPost[] | null>(null);
  const [txid, setTxid] = useState("");
  const ups = upsOf(post.author);
  const total = totalOf(post.author, post.authorScore);
  const roomContract = post.contract;
  const roomSymbol = post.symbol;

  const loadReplies = () => {
    void fetchFeed(roomContract, roomSymbol, { parentId: post.id })
      .then((res) => setReplies(res.posts))
      .catch(() => setReplies([]));
  };

  return (
    <article className={depth ? "insiders-reply" : "insiders-post"}>
      <AccountFace
        account={post.author}
        total={total}
        stored={post.authorScore}
        ups={ups}
        clubMark={clubOf?.(post.author, roomContract, roomSymbol) ?? null}
      />
      <p className="insiders-body">{post.body}</p>
      {post.giphyUrl ? <img src={post.giphyUrl} alt="" className="insiders-post-gif" /> : null}
      <div className="insiders-actions">
        <button
          type="button"
          className="insiders-quiet"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next && replies == null) loadReplies();
          }}
        >
          {ago(post.createdAt)}
          {post.replyCount ? ` · ${post.replyCount}` : ""}
        </button>
        {canWrite ? (
          <button type="button" className="insiders-quiet" onClick={() => setReplying((v) => !v)}>
            {replying ? "close" : "reply"}
          </button>
        ) : null}
        <UpButton
          connected={Boolean(actor)}
          onNeedConnect={onNeedConnect}
          onCommit={async (whole) => {
            const id = await onUp(post, whole);
            setTxid(id);
            onPosted();
          }}
        />
        {txid ? <span className="insiders-quiet">{txid.slice(0, 8)}</span> : null}
      </div>
      {replying ? (
        <div className="mt-2">
          <Composer
            actor={actor}
            canPost={canWrite}
            lockedReason={lockedReason}
            submitLabel="Reply"
            symbol={roomSymbol}
            onSubmit={async (body, captchaId, captchaAnswer, giphyUrl) => {
              if (!actor) return;
              await createPost({
                contract: roomContract,
                symbol: roomSymbol,
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
          {replies == null ? <p className="insiders-muted">…</p> : null}
          {replies?.map((r) => (
            <FeedPost
              key={r.id}
              post={r}
              totalOf={totalOf}
              upsOf={upsOf}
              actor={actor}
              canWrite={canWrite}
              lockedReason={lockedReason}
              authorScore={authorScore}
              onPosted={onPosted}
              onUp={onUp}
              onNeedConnect={onNeedConnect}
              clubOf={clubOf}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
