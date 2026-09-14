import { useCallback, useEffect, useMemo, useState } from "react";
import { ListingPacket } from "@/components/token/ListingPacket";
import { isFlexContractActor, programFromAccount } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { validSymbol } from "@/services/assets";
import {
  draftFromSources,
  emptyListingDraft,
  mergeAdminTokenRefs,
  type ListingDraft,
} from "@/services/listingHelper";
import {
  listContractTokenRefs,
  listProtonRowsForContract,
  protonSyncGaps,
  tokenProtonLogoAction,
  rowMatchesContractSymbol,
  type ProtonTokenRow,
} from "@/services/tokenProton";
import { listManagerTokens } from "@/services/managerApi";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

export default function Admin() {
  const { actor, transact } = useWallet();
  const allowed = isFlexContractActor(actor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<Array<{ symbol: string; precision: number }>>([]);
  const [rows, setRows] = useState<ProtonTokenRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ListingDraft>>({});
  const [signing, setSigning] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, { tx?: string; err?: string }>>({});
  const [manualSym, setManualSym] = useState("");
  const [manualPrec, setManualPrec] = useState("6");

  const load = useCallback(async () => {
    if (!actor || !allowed) return;
    setBusy(true);
    setError("");
    try {
      const [refs, proton, stored] = await Promise.all([
        listContractTokenRefs(actor).catch(() => [] as Array<{ symbol: string; precision: number }>),
        listProtonRowsForContract(actor)
          .then((list) => ({ list, err: "" }))
          .catch((err) => ({ list: [] as ProtonTokenRow[], err: txErrorMessage(err) })),
        listManagerTokens({ contract: actor }).catch(() => []),
      ]);
      if (proton.err) setError(proton.err);
      const nextTokens = mergeAdminTokenRefs({
        tcontract: actor,
        refs,
        stored,
        proton: proton.list,
      });
      setTokens(nextTokens);
      setRows(proton.list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const t of nextTokens) {
          if (next[t.symbol]) continue;
          next[t.symbol] = draftFromSources({
            symbol: t.symbol,
            proton: proton.list.find((r) => rowMatchesContractSymbol(r, actor, t.precision, t.symbol)),
            stored: stored.find((s) => s.symbol === t.symbol) ?? null,
          });
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

  const patchDraft = (symbol: string, p: Partial<ListingDraft>) => {
    setDrafts((d) => ({ ...d, [symbol]: { ...(d[symbol] ?? emptyListingDraft(symbol)), ...p } }));
  };

  const sign = async (symbol: string, precision: number, row: ProtonTokenRow | null) => {
    if (!actor) return;
    const d = drafts[symbol] ?? emptyListingDraft(symbol);
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
    setTokens((t) =>
      t.some((x) => x.symbol === symbol) ? t : [...t, { symbol, precision }].sort((a, b) => a.symbol.localeCompare(b.symbol))
    );
    setDrafts((d) => ({ ...d, [symbol]: d[symbol] ?? emptyListingDraft(symbol) }));
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
    const d = drafts[t.symbol] ?? emptyListingDraft(t.symbol);
    const row = rowFor(t.symbol, t.precision);
    return (
      <li key={`${t.symbol}:${t.precision}`} className="rounded-xl border border-border bg-background/40 p-4">
        <ListingPacket
          contract={actor ?? ""}
          symbol={t.symbol}
          precision={t.precision}
          draft={d}
          onChange={(p) => patchDraft(t.symbol, p)}
          protonOn={!missing}
          canSign
          missing={missing}
          signing={signing === t.symbol}
          disabled={signing != null}
          onSign={() => void sign(t.symbol, t.precision, row)}
          msg={msg[t.symbol]}
        />
      </li>
    );
  };

  const manualBox = (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">Add a symbol by hand</p>
      <p className="text-xs text-muted-foreground">
        Use this if launches, create history, or sqlite missed a token that already has a stat row.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <FieldTicker value={manualSym} onChange={setManualSym} />
        <FieldPrec value={manualPrec} onChange={setManualPrec} />
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!validSymbol(manualSym.trim().toUpperCase())}
          onClick={addManual}
        >
          Add
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-mono">{actor}</span>
        {program ? ` (${program})` : ""}. Fill name, URL, description, and icon URL, then sign token.proton::reg or
        update as {actor}@active. Lists merge launches, create history, and Manager sqlite even if token.proton scan
        fails.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {tokens.length === 0 ? <div className="mt-8">{manualBox}</div> : null}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Needs sync</h2>
      {gaps.length === 0 && !busy ? (
        <p className="mt-2 text-sm text-muted-foreground">No gaps in the merged list.</p>
      ) : (
        <ul className="mt-3 space-y-3">{gaps.map((t) => card(t, true))}</ul>
      )}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Already on token.proton</h2>
      {synced.length === 0 && !busy ? (
        <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">{synced.map((t) => card(t, false))}</ul>
      )}

      {tokens.length > 0 ? <div className="mt-8">{manualBox}</div> : null}
    </div>
  );
}

function FieldTicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticker</span>
      <input
        className="input font-mono uppercase"
        maxLength={7}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
      />
    </label>
  );
}

function FieldPrec({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Precision</span>
      <input
        className="input font-mono w-20"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    </label>
  );
}
