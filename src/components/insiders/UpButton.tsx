import { useEffect, useRef, useState } from "react";
import { UP_IDLE_MS, upDeltaForClick } from "@/services/insidersRules";

type Flash = { id: number; n: number };

export function UpButton({
  disabled,
  onCommit,
}: {
  disabled?: boolean;
  onCommit: (whole: number) => Promise<void>;
}) {
  const [clicks, setClicks] = useState(0);
  const [pending, setPending] = useState(0);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(0);
  const fid = useRef(0);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const fire = () => {
    const n = pendingRef.current;
    if (!(n > 0) || busy) return;
    setBusy(true);
    setErr("");
    void onCommit(n)
      .then(() => {
        setClicks(0);
        setPending(0);
        pendingRef.current = 0;
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="insiders-up">
      <button
        type="button"
        className="insiders-up-btn"
        disabled={disabled || busy}
        onClick={() => {
          if (disabled || busy) return;
          const nextClicks = clicks + 1;
          const delta = upDeltaForClick(nextClicks);
          const next = pending + delta;
          setClicks(nextClicks);
          setPending(next);
          pendingRef.current = next;
          fid.current += 1;
          const id = fid.current;
          setFlashes((f) => [...f, { id, n: delta }]);
          window.setTimeout(() => setFlashes((f) => f.filter((x) => x.id !== id)), 700);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(fire, UP_IDLE_MS);
        }}
      >
        {busy ? "Signing…" : pending > 0 ? `UP ${pending}` : "UP"}
      </button>
      {flashes.map((f) => (
        <span key={f.id} className="insiders-up-flash">
          +{f.n}
        </span>
      ))}
      {pending > 0 && !busy ? (
        <span className="insiders-up-hint">Stay connected. TX in {UP_IDLE_MS / 1000}s idle.</span>
      ) : null}
      {err ? <span className="text-[11px] text-destructive">{err}</span> : null}
    </div>
  );
}
