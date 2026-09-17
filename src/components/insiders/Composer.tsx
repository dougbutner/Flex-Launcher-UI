import { useEffect, useState } from "react";
import { GifPicker } from "@/components/insiders/GifPicker";
import { fetchCaptcha } from "@/services/insidersApi";
import { BODY_USER_MAX } from "@/services/insidersRules";

export function Composer({
  actor,
  canPost,
  lockedReason,
  submitLabel,
  symbol,
  onSubmit,
}: {
  actor: string | null;
  canPost: boolean;
  lockedReason: string;
  submitLabel: string;
  symbol: string;
  onSubmit: (body: string, captchaId: string, captchaAnswer: string, giphyUrl: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [giphy, setGiphy] = useState("");
  const [answer, setAnswer] = useState("");
  const [captcha, setCaptcha] = useState<{ id: string; prompt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tag = ` $${symbol.toUpperCase()}`;
  const left = BODY_USER_MAX - text.length;

  const loadCaptcha = () => {
    void fetchCaptcha()
      .then(setCaptcha)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  if (!actor) {
    return <p className="insiders-muted">Connect a wallet to write.</p>;
  }
  if (!canPost) {
    return <p className="insiders-muted">{lockedReason}</p>;
  }

  return (
    <form
      className="insiders-composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!captcha || busy) return;
        setBusy(true);
        setErr("");
        void onSubmit(text, captcha.id, answer, giphy)
          .then(() => {
            setText("");
            setGiphy("");
            setAnswer("");
            loadCaptcha();
          })
          .catch((error) => {
            setErr(error instanceof Error ? error.message : String(error));
            loadCaptcha();
          })
          .finally(() => setBusy(false));
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, BODY_USER_MAX))}
        rows={3}
        maxLength={BODY_USER_MAX}
        placeholder="What's happening"
        className="insiders-composer-input"
      />
      <div className="insiders-composer-meta">
        <span className="insiders-tag">{tag}</span>
        <span className={left < 40 ? "text-primary" : "text-muted-foreground"}>
          {left}
        </span>
      </div>
      <GifPicker value={giphy} onPick={setGiphy} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{captcha ? captcha.prompt : "…"}</span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            inputMode="numeric"
            className="w-16 border border-border bg-background px-2 py-1 text-foreground"
            aria-label="Captcha answer"
          />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !text.trim() || !answer.trim()}>
          {busy ? "Sending…" : submitLabel}
        </button>
      </div>
      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </form>
  );
}
