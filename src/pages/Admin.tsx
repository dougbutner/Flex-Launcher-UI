import { useCallback, useEffect, useMemo, useState } from "react";
import { explorerTx, isFlexContractActor, programFromAccount } from "@/config/launch";
import { Field } from "@/components/launch/ui";
import { useWallet } from "@/hooks/useWallet";
import { validSymbol } from "@/services/assets";
import { validImageUrl } from "@/services/tokenLogo";
import {
  listContractTokenRefs,
  listProtonRowsForContract,
  protonSyncGaps,
  tokenProtonLogoAction,
  rowMatchesContractSymbol,
  type ProtonTokenRow,
} from "@/services/tokenProton";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

type Draft = { tname: string; url: string; desc: string; iconurl: string };

const emptyDraft = (symbol: string): Draft => ({ tname: symbol, url: "", desc: "", iconurl: "" });

export default function Admin() {
  const { actor, transact } = useWallet();
  const allowed = isFlexContractActor(actor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<Array<{ symbol: string; precision: number }>>([]);
  const [rows, setRows] = useState<ProtonTokenRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [signing, setSigning] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { tx?: string; err?: string }>>({});
  const [manualSym, setManualSym] = useState("");
  const [manualPrec, setManualPrec] = useState("6");

  const load = useCallback(async () => {
    if (!actor || !allowed) return;
    setBusy(true);
    setError("");
    try {
      const [refs, proton] = await Promise.all([listContractTokenRefs(actor), listProtonRowsForContract(actor)]);
      setTokens(refs);
      setRows(proton);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const t of refs) {
          if (!next[t.symbol]) {
            const row = proton.find((r) => rowMatchesContractSymbol(r, actor, t.precision, t.symbol));
            next[t.symbol] = {
              tname: row?.tname || t.symbol,
              url: row?.url || "",
              desc: row?.desc || "",
              iconurl: row?.iconurl || "",
            };
          }
        }
        return next;
      });
    } catch (err) {
      setError(txErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [actor, allowed]);

  useEffect(() => {
    void load();
  }, [load]);

  const gaps = useMemo(() => (actor ? protonSyncGaps(tokens, rows, actor) : []), [actor, tokens, rows]);
  const synced = useMemo(
    () => tokens.filter((t) => !gaps.some((g) => g.symbol === t.symbol && g.precision === t.precision)),
    [tokens, gaps]
  );

  const patchDraft = (symbol: string, p: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [symbol]: { ...(d[symbol] ?? emptyDraft(symbol)), ...p } }));
  };

  const sign = async (symbol: string, precision: number, row: ProtonTokenRow | null) => {
    if (!actor) return;
    const d = drafts[symbol] ?? emptyDraft(symbol);
    setSigning(symbol);
    setMsg((m) => ({ ...m, [symbol]: {} }));
    try {
      const result = await transact([
        tokenProtonLogoAction({
          row,
          tcontract: actor,
          tname: d.tname.trim() || symbol,
          url: d.url.trim(),
          desc: d.desc.trim(),
          iconurl: d.iconurl.trim(),
          precision,
          symbol,
        }),
      ]);
      setMsg((m) => ({ ...m, [symbol]: { tx: txIdFromResult(result) || "ok" } }));
      await load();
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg((m) => ({ ...m, [symbol]: { err: hint ? `${text} - ${hint}` : text } }));
    } finally {
      setSigning(null);
    }
  };

  const addManual = () => {
    const symbol = manualSym.trim().toUpperCase();
    const precision = Math.max(0, Math.min(8, Number(manualPrec) || 0));
    if (!validSymbol(symbol)) return;
    setTokens((t) => (t.some((x) => x.symbol === symbol) ? t : [...t, { symbol, precision }].sort((a, b) => a.symbol.localeCompare(b.symbol))));
    setDrafts((d) => ({ ...d, [symbol]: d[symbol] ?? emptyDraft(symbol) }));
    setManualSym("");
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect as <span className="font-mono">3asy</span>, <span className="font-mono">fl3x</span>, or{" "}
          <span className="font-mono">for3x</span> to sync token metadata to token.proton.
        </p>
      </div>
    );
  }

  const program = programFromAccount(actor ?? "");
  const rowFor = (symbol: string, precision: number) =>
    rows.find((r) => rowMatchesContractSymbol(r, actor, precision, symbol)) ?? null;

  const card = (t: { symbol: string; precision: number }, missing: boolean) => {
    const d = drafts[t.symbol] ?? emptyDraft(t.symbol);
    const row = rowFor(t.symbol, t.precision);
    const status = msg[t.symbol];
    const iconOk = !d.iconurl || validImageUrl(d.iconurl);
    return (
      <li key={`${t.symbol}:${t.precision}`} className="space-y-3 rounded-xl border border-border bg-background/40 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-sm font-bold">
            {t.precision},{t.symbol} @ {actor}
          </p>
          <span className={`text-xs ${missing ? "text-warning" : "text-muted-foreground"}`}>
            {missing ? "Not on token.proton" : "Synced"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={d.tname} onChange={(e) => patchDraft(t.symbol, { tname: e.target.value })} />
          </Field>
          <Field label="URL">
            <input className="input" placeholder="https://" value={d.url} onChange={(e) => patchDraft(t.symbol, { url: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <input className="input" value={d.desc} onChange={(e) => patchDraft(t.symbol, { desc: e.target.value })} />
        </Field>
        <Field label="Icon URL" error={d.iconurl && !iconOk ? "Use a full http(s) URL." : undefined}>
          <input
            className="input font-mono text-xs"
            placeholder="https://"
            value={d.iconurl}
            onChange={(e) => patchDraft(t.symbol, { iconurl: e.target.value })}
          />
        </Field>
        {status?.tx && status.tx !== "ok" ? (
          <a href={explorerTx(status.tx)} className="link font-mono text-xs" target="_blank" rel="noopener noreferrer">
            tx {status.tx.slice(0, 12)}…
          </a>
        ) : null}
        {status?.err ? <p className="text-xs font-medium text-destructive">{status.err}</p> : null}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={signing != null || Boolean(d.iconurl && !iconOk)}
          onClick={() => void sign(t.symbol, t.precision, row)}
        >
          {signing === t.symbol ? "Signing…" : missing ? "Sign token.proton::reg" : "Sign token.proton::update"}
        </button>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-mono">{actor}</span>
        {program ? ` (${program})` : ""}. Register tokens that exist on this contract but are missing from token.proton.
        Wallet will ask for token.proton::reg or update, authorized by {actor}@active.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Needs sync</h2>
      {gaps.length === 0 && !busy ? (
        <p className="mt-2 text-sm text-muted-foreground">No gaps found from launches and create history.</p>
      ) : (
        <ul className="mt-3 space-y-3">{gaps.map((t) => card(t, true))}</ul>
      )}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Already on token.proton</h2>
      {synced.length === 0 && !busy ? (
        <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">{synced.map((t) => card(t, false))}</ul>
      )}

      <div className="mt-8 space-y-3 rounded-xl border border-border p-4">
        <p className="text-sm font-semibold">Add a symbol by hand</p>
        <p className="text-xs text-muted-foreground">Use this if create history missed a token that already has a stat row.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Ticker">
            <input
              className="input font-mono uppercase"
              maxLength={7}
              value={manualSym}
              onChange={(e) => setManualSym(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
          </Field>
          <Field label="Precision">
            <input className="input font-mono w-20" inputMode="numeric" value={manualPrec} onChange={(e) => setManualPrec(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <button type="button" className="btn btn-outline btn-sm" disabled={!validSymbol(manualSym.trim().toUpperCase())} onClick={addManual}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
