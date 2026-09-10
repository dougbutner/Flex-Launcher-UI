import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Field, StatusIcon } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { useWallet } from "@/hooks/useWallet";
import { MANAGER_RESUME_KEY, writeLaunchDraft } from "@/hooks/useLaunchDraft";
import { listIssuerTokens } from "@/services/issuerTokens";
import { listManagerTokens, upsertManagerToken } from "@/services/managerApi";
import { draftFromManager } from "@/services/managerDraft";
import {
  applyManagerMeta,
  LAUNCH_STEP_IDS,
  LAUNCH_STEPS,
  managerHasStarted,
  managerTokenKey,
  mergeManagerViews,
  sanitizeManagerMeta,
  type ManagerMetaPatch,
  type ManagerToken,
  type ManagerView,
} from "@/services/managerStore";
import { txErrorMessage } from "@/services/txParse";

export default function Manager() {
  const { actor, isLoggedIn, addWebAuthWallet } = useWallet();
  const navigate = useNavigate();
  const [views, setViews] = useState<ManagerView[] | null>(null);
  const [selected, setSelected] = useState("");
  const [meta, setMeta] = useState<ManagerMetaPatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [storeHint, setStoreHint] = useState("");

  const load = useCallback(async () => {
    if (!actor) return;
    setBusy(true);
    setError("");
    setStoreHint("");
    try {
      let stored: ManagerToken[] = [];
      try {
        stored = await listManagerTokens({ issuer: actor });
      } catch (err) {
        setStoreHint(txErrorMessage(err));
      }
      const chain = await listIssuerTokens(actor).catch(() => []);
      const next = mergeManagerViews(chain, stored);
      setViews(next);
      setSelected((cur) => {
        if (cur && next.some((v) => managerTokenKey(v.token.contract, v.token.symbol) === cur)) return cur;
        return next[0] ? managerTokenKey(next[0].token.contract, next[0].token.symbol) : "";
      });
    } catch (err) {
      setError(txErrorMessage(err));
      setViews([]);
    } finally {
      setBusy(false);
    }
  }, [actor]);

  useEffect(() => {
    if (isLoggedIn && actor) void load();
    else {
      setViews(null);
      setSelected("");
      setMeta(null);
    }
  }, [isLoggedIn, actor, load]);

  const view = views?.find((v) => managerTokenKey(v.token.contract, v.token.symbol) === selected) ?? null;

  useEffect(() => {
    if (!view) {
      setMeta(null);
      return;
    }
    setMeta({
      name: view.token.name || view.token.symbol,
      description: view.token.description,
      website: view.token.website,
      twitter: view.token.twitter,
      telegram: view.token.telegram,
      farcaster: view.token.farcaster,
      imageUrl: view.token.imageUrl,
    });
    setSaveMsg("");
  }, [view?.token.contract, view?.token.symbol, view?.token.updatedAt]);

  const save = async () => {
    if (!view || !meta || !actor) return;
    const clean = sanitizeManagerMeta(meta);
    if (typeof clean === "string") {
      setSaveMsg(clean);
      return;
    }
    setSaving(true);
    setSaveMsg("");
    try {
      const saved = await upsertManagerToken(applyManagerMeta(view.token, clean));
      setViews((prev) =>
        (prev ?? []).map((v) =>
          managerTokenKey(v.token.contract, v.token.symbol) === managerTokenKey(saved.contract, saved.symbol)
            ? { ...v, token: { ...v.token, ...saved } }
            : v
        )
      );
      setSaveMsg("Saved. Admin can push this to token.proton later.");
    } catch (err) {
      setSaveMsg(txErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const continueLaunch = () => {
    if (!view) return;
    writeLaunchDraft(draftFromManager(view.token));
    try {
      sessionStorage.setItem(MANAGER_RESUME_KEY, "1");
    } catch {
      /* ignore */
    }
    navigate("/launch");
  };

  if (!isLoggedIn || !actor) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Manager</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect the issuer account that already signed create. This page follows that account name, not this browser.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => void addWebAuthWallet()}>
          Connect WebAuth
        </button>
      </div>
    );
  }

  const started = views != null && managerHasStarted(views);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Manager</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Releases for <span className="font-mono">{actor}</span>. Progress is read from chain. Name, URL, and icon stay
            in the sqlite store until admin signs token.proton.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {storeHint ? (
        <p className="mt-4 text-xs text-warning">
          Metadata store: {storeHint}. You can still follow on-chain next steps.
        </p>
      ) : null}

      {views == null || busy ? (
        <p className="mt-8 text-sm text-muted-foreground">Reading issuer releases…</p>
      ) : !started ? (
        <div className="card mt-8 p-6">
          <p className="text-sm text-muted-foreground">
            Manager shows up after your first on-chain create. Start on the Launch page, then come back from any device
            with this account.
          </p>
          <Link to="/launch" className="btn btn-primary mt-4 inline-flex">
            Go to Launch
          </Link>
        </div>
      ) : (
        <>
          {views.length > 1 ? (
            <ul className="mt-6 space-y-2">
              {views.map((v) => {
                const key = managerTokenKey(v.token.contract, v.token.symbol);
                const on = key === selected;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setSelected(key)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${
                        on ? "border-primary bg-primary/10" : "border-border bg-background/40 hover:border-primary/40"
                      }`}
                    >
                      <TokenIcon contract={v.token.contract} symbol={v.token.symbol} size={36} rounded="xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-bold">
                          {v.token.name || v.token.symbol}{" "}
                          <span className="text-muted-foreground">${v.token.symbol}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {v.token.program} @ {v.token.contract} · {v.inProgress ? v.next.label : "live"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {view && meta ? (
            <section className="card mt-6 space-y-5 p-6">
              <div className="flex items-start gap-4">
                {meta.imageUrl ? (
                  <img src={meta.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <TokenIcon contract={view.token.contract} symbol={view.token.symbol} size={64} rounded="xl" />
                )}
                <div>
                  <p className="font-mono text-lg font-bold">${view.token.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {view.token.precision} decimals · {view.token.program} @ {view.token.contract}
                    {view.token.maxSupply ? ` · max ${view.token.maxSupply}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Ticker, precision, and program are fixed on chain.</p>
                </div>
              </div>

              <Field label="Display name">
                <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <textarea
                  className="input min-h-[88px] resize-y"
                  value={meta.description}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Website">
                  <input
                    className="input"
                    placeholder="https://"
                    value={meta.website}
                    onChange={(e) => setMeta({ ...meta, website: e.target.value })}
                  />
                </Field>
                <Field label="X / Twitter">
                  <input className="input" value={meta.twitter} onChange={(e) => setMeta({ ...meta, twitter: e.target.value })} />
                </Field>
                <Field label="Telegram">
                  <input
                    className="input"
                    placeholder="t.me/channel"
                    value={meta.telegram}
                    onChange={(e) => setMeta({ ...meta, telegram: e.target.value })}
                  />
                </Field>
                <Field label="Farcaster">
                  <input className="input" value={meta.farcaster} onChange={(e) => setMeta({ ...meta, farcaster: e.target.value })} />
                </Field>
              </div>
              <Field
                label="Icon URL"
                hint="Paste a public http(s) image URL. Re-upload to IPFS is not available here."
              >
                <input
                  className="input font-mono text-xs"
                  placeholder="https://"
                  value={meta.imageUrl}
                  onChange={(e) => setMeta({ ...meta, imageUrl: e.target.value })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save metadata"}
                </button>
                {view.inProgress ? (
                  <button type="button" className="btn btn-outline btn-sm" onClick={continueLaunch}>
                    Continue launch
                  </button>
                ) : (
                  <Link to={`/token/${view.token.contract}/${view.token.symbol}`} className="btn btn-outline btn-sm">
                    Open token
                  </Link>
                )}
              </div>
              {saveMsg ? <p className="text-xs text-muted-foreground">{saveMsg}</p> : null}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Launch steps</p>
                <ol className="mt-2 space-y-1.5">
                  {LAUNCH_STEP_IDS.map((id) => {
                    const done = view.progress[id];
                    const current = view.next.id === id;
                    return (
                      <li key={id} className="flex items-center gap-2 text-xs">
                        <StatusIcon state={done ? "done" : current ? "active" : "todo"} />
                        <span className={done ? "text-muted-foreground" : current ? "text-foreground font-medium" : "text-muted-foreground"}>
                          {LAUNCH_STEPS[id].label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next step</p>
                <p className="mt-1 text-sm font-semibold">{view.next.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{view.next.prompt}</p>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
