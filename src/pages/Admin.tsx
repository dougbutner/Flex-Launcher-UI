import { useCallback, useEffect, useMemo, useState } from "react";
import { RainDefaultsFields } from "@/components/launch/RainDefaultsFields";
import { TxLink } from "@/components/launch/ui";
import { AdminListingPlaces } from "@/components/token/AdminListingPlaces";
import { ListingPacket } from "@/components/token/ListingPacket";
import { TokenIcon } from "@/components/TokenIcon";
import { isFlexContractActor, programFromAccount } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { validSymbol } from "@/services/assets";
import { readStat } from "@/services/flexTables";
import { validImageUrl } from "@/services/tokenLogo";
import {
  draftFromSources,
  emptyListingDraft,
  mergeAdminTokenRefs,
  type ListingDraft,
} from "@/services/listingHelper";
import { checkAirdropsListing, checkAlcorListing, type ListingPlaceCheck } from "@/services/listingRepos";
import { listManagerTokens, upsertManagerToken } from "@/services/managerApi";
import {
  applyProtonListing,
  applyRepoListing,
  emptyManagerToken,
  protonListingStatus,
  type ManagerToken,
} from "@/services/managerStore";
import { rainFromRow, type RainDefaults } from "@/services/rainDefaults";
import {
  listContractTokenRefs,
  loadProtonTokenTable,
  parseProtonSymbol,
  pickProtonRow,
  tokenProtonLogoAction,
  tokenProtonRemoveAction,
  type ProtonTokenRow,
} from "@/services/tokenProton";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";
import { AdminDatabase } from "@/components/admin/AdminDatabase";
import { AdminSandboxToggle } from "@/test/sandbox/AdminSandboxToggle";
import { AdminListSkeleton } from "@/components/ui/PageSkeletons";

type TokenRef = { symbol: string; precision: number };

export default function Admin() {
  const { actor, transact } = useWallet();
  const allowed = isFlexContractActor(actor);
  const [busy, setBusy] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkNote, setCheckNote] = useState("");
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<TokenRef[]>([]);
  const [rows, setRows] = useState<ProtonTokenRow[]>([]);
  const [stored, setStored] = useState<ManagerToken[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ListingDraft>>({});
  const [rain, setRain] = useState<Record<string, RainDefaults>>({});
  const [signing, setSigning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [github, setGithub] = useState<Record<string, { alcor?: ListingPlaceCheck; airdrops?: ListingPlaceCheck }>>({});
  const [githubBusy, setGithubBusy] = useState<string | null>(null);
  const [rainSaving, setRainSaving] = useState<string | null>(null);
  const [rainMsg, setRainMsg] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { tx?: string; err?: string }>>({});
  const [manualSym, setManualSym] = useState("");
  const [manualPrec, setManualPrec] = useState("6");

  const storedFor = useCallback(
    (symbol: string) => stored.find((s) => s.symbol === symbol) ?? null,
    [stored]
  );

  const load = useCallback(async () => {
    if (!actor || !allowed) return;
    setBusy(true);
    setError("");
    try {
      const [refs, storedRows] = await Promise.all([
        listContractTokenRefs(actor).catch(() => [] as TokenRef[]),
        listManagerTokens({ contract: actor }).catch(() => []),
      ]);
      const nextTokens = mergeAdminTokenRefs({
        tcontract: actor,
        refs,
        stored: storedRows,
        proton: [],
      });
      setTokens(nextTokens);
      setStored(storedRows);
      setRain((prev) => {
        const next = { ...prev };
        for (const t of nextTokens) {
          next[t.symbol] = rainFromRow(storedRows.find((s) => s.symbol === t.symbol));
        }
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        for (const t of nextTokens) {
          if (next[t.symbol]) continue;
          next[t.symbol] = draftFromSources({
            symbol: t.symbol,
            stored: storedRows.find((s) => s.symbol === t.symbol) ?? null,
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

  const unchecked = useMemo(
    () => tokens.filter((t) => protonListingStatus(storedFor(t.symbol)) !== "listed"),
    [tokens, storedFor]
  );
  const synced = useMemo(
    () => tokens.filter((t) => protonListingStatus(storedFor(t.symbol)) === "listed"),
    [tokens, storedFor]
  );

  const patchDraft = (symbol: string, p: Partial<ListingDraft>) => {
    setDrafts((d) => ({ ...d, [symbol]: { ...(d[symbol] ?? emptyListingDraft(symbol)), ...p } }));
  };

  const rememberStored = (saved: ManagerToken) => {
    setStored((prev) => {
      const rest = prev.filter((s) => s.symbol !== saved.symbol);
      return [...rest, saved];
    });
  };

  const ensureRow = async (symbol: string, precision: number): Promise<ManagerToken> => {
    const existing = storedFor(symbol);
    if (existing) return existing;
    if (!actor) throw new Error("Connect as the token contract.");
    const program = programFromAccount(actor);
    if (!program) throw new Error("Unknown flex contract.");
    const stat = await readStat(actor, symbol);
    const issuer = String(stat?.issuer ?? "");
    if (!issuer) throw new Error("Need a stat issuer to store this token.");
    const d = drafts[symbol] ?? emptyListingDraft(symbol);
    return {
      ...emptyManagerToken(),
      issuer,
      contract: actor,
      symbol,
      precision,
      program,
      name: d.tname.trim() || symbol,
      website: d.url.trim(),
      description: d.desc.trim(),
      imageUrl: validImageUrl(d.iconurl.trim()) ? d.iconurl.trim() : "",
      createTx: "onchain",
    };
  };

  const persistCheck = async (t: TokenRef, proton: ProtonTokenRow | null) => {
    const parsed = proton ? parseProtonSymbol(proton.symbol) : null;
    const precision = parsed?.precision ?? t.precision;
    const base = await ensureRow(t.symbol, precision);
    const withIcon =
      proton?.iconurl && validImageUrl(proton.iconurl)
        ? { ...base, precision, imageUrl: proton.iconurl }
        : { ...base, precision };
    const saved = await upsertManagerToken(applyProtonListing(withIcon, Boolean(proton), proton?.id ?? ""));
    rememberStored(saved);
    if (proton) {
      setDrafts((d) => ({
        ...d,
        [t.symbol]: draftFromSources({
          symbol: t.symbol,
          proton,
          stored: saved,
        }),
      }));
    }
    return saved;
  };

  const rowFor = (symbol: string, precision: number) => {
    const live = actor ? pickProtonRow(rows, actor, symbol, precision) : null;
    if (live) return live;
    const sq = storedFor(symbol);
    if (!sq?.protonListed || !sq.protonId || !actor) return null;
    const d = drafts[symbol] ?? emptyListingDraft(symbol);
    return {
      id: sq.protonId,
      tcontract: actor,
      tname: d.tname,
      url: d.url,
      desc: d.desc,
      iconurl: d.iconurl,
      symbol: `${sq.precision || precision},${symbol}`,
    } satisfies ProtonTokenRow;
  };

  const checkTokens = async (only?: TokenRef) => {
    if (!actor) return;
    setChecking(only ? only.symbol : "all");
    setCheckNote("");
    setError("");
    try {
      const list = await loadProtonTokenTable(!only);
      const mine = list.filter((r) => r.tcontract === actor);
      setRows(mine);
      const nextTokens = mergeAdminTokenRefs({
        tcontract: actor,
        refs: tokens,
        stored,
        proton: mine,
      });
      setTokens(nextTokens);
      const targets = only ? [only] : nextTokens;
      let i = 0;
      for (const t of targets) {
        i += 1;
        setCheckNote(`${i}/${targets.length} ${t.symbol}`);
        const hit = pickProtonRow(mine, actor, t.symbol, t.precision);
        try {
          await persistCheck(t, hit);
        } catch (err) {
          setMsg((m) => ({ ...m, [t.symbol]: { err: txErrorMessage(err) } }));
        }
      }
      setCheckNote(only ? `Checked ${only.symbol}.` : `Checked ${targets.length} tokens.`);
    } catch (err) {
      setError(txErrorMessage(err));
    } finally {
      setChecking(null);
    }
  };

  const sign = async (symbol: string, precision: number) => {
    if (!actor) return;
    const d = drafts[symbol] ?? emptyListingDraft(symbol);
    setSigning(symbol);
    setMsg((m) => ({ ...m, [symbol]: {} }));
    try {
      const next = await loadProtonTokenTable(true);
      const mine = next.filter((r) => r.tcontract === actor);
      setRows(mine);
      const live = pickProtonRow(mine, actor, symbol, precision);
      const result = await transact([
        tokenProtonLogoAction({
          row: live,
          tcontract: actor,
          tname: d.tname.trim() || symbol,
          url: d.url.trim(),
          desc: d.desc.trim(),
          iconurl: d.iconurl.trim(),
          precision: (live && parseProtonSymbol(live.symbol)?.precision) || precision,
          symbol,
          signer: actor,
        }),
      ]);
      setMsg((m) => ({ ...m, [symbol]: { tx: txIdFromResult(result) || "ok" } }));
      const after = await loadProtonTokenTable(true);
      const mineAfter = after.filter((r) => r.tcontract === actor);
      setRows(mineAfter);
      const hit = pickProtonRow(mineAfter, actor, symbol, precision);
      await persistCheck({ symbol, precision }, hit);
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg((m) => ({ ...m, [symbol]: { err: hint ? `${text} - ${hint}` : text } }));
    } finally {
      setSigning(null);
    }
  };

  const remove = async (symbol: string, precision: number) => {
    if (!actor) return;
    setRemoving(symbol);
    setMsg((m) => ({ ...m, [symbol]: {} }));
    try {
      const next = await loadProtonTokenTable(true);
      const mine = next.filter((r) => r.tcontract === actor);
      setRows(mine);
      const live = pickProtonRow(mine, actor, symbol, precision) ?? rowFor(symbol, precision);
      if (!live) throw new Error("This token is not on token.proton.");
      const result = await transact([tokenProtonRemoveAction({ id: live.id, signer: actor })]);
      setMsg((m) => ({ ...m, [symbol]: { tx: txIdFromResult(result) || "ok" } }));
      const after = await loadProtonTokenTable(true);
      const mineAfter = after.filter((r) => r.tcontract === actor);
      setRows(mineAfter);
      await persistCheck({ symbol, precision }, null);
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg((m) => ({ ...m, [symbol]: { err: hint ? `${text} - ${hint}` : text } }));
    } finally {
      setRemoving(null);
    }
  };

  const checkGithub = async (t: TokenRef) => {
    if (!actor) return;
    setGithubBusy(t.symbol);
    try {
      const [alcor, airdrops] = await Promise.all([
        checkAlcorListing(t.symbol, actor),
        checkAirdropsListing(t.symbol, actor),
      ]);
      setGithub((g) => ({ ...g, [t.symbol]: { alcor, airdrops } }));
      let row = await ensureRow(t.symbol, t.precision);
      row = applyRepoListing(row, "alcor", alcor);
      row = applyRepoListing(row, "airdrops", airdrops);
      const saved = await upsertManagerToken(row);
      rememberStored(saved);
    } catch (err) {
      setMsg((m) => ({ ...m, [t.symbol]: { err: txErrorMessage(err) } }));
    } finally {
      setGithubBusy(null);
    }
  };

  const saveRain = async (symbol: string, precision: number) => {
    if (!actor) return;
    const program = programFromAccount(actor);
    if (!program) return;
    const defaults = rain[symbol] ?? rainFromRow(null);
    setRainSaving(symbol);
    setRainMsg((m) => ({ ...m, [symbol]: "" }));
    try {
      const row = await ensureRow(symbol, precision);
      const saved = await upsertManagerToken({ ...row, ...defaults, updatedAt: Date.now() });
      rememberStored(saved);
      setRain((r) => ({ ...r, [symbol]: rainFromRow(saved) }));
      setRainMsg((m) => ({ ...m, [symbol]: "Saved. Make it rain in this app uses these floors." }));
    } catch (err) {
      setRainMsg((m) => ({ ...m, [symbol]: txErrorMessage(err) }));
    } finally {
      setRainSaving(null);
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
    setRain((r) => ({ ...r, [symbol]: r[symbol] ?? rainFromRow(null) }));
    setManualSym("");
  };

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect as <span className="font-mono">3asy</span>, <span className="font-mono">fl3x</span>, or{" "}
          <span className="font-mono">for3x</span> to sync token metadata to token.proton and set reflection minimums.
        </p>
      </div>
    );
  }

  const program = programFromAccount(actor ?? "");
  const busyAny = busy || checking != null || signing != null || removing != null;

  const places = (t: TokenRef) => (
    <AdminListingPlaces
      actor={actor ?? ""}
      symbol={t.symbol}
      precision={t.precision}
      draft={drafts[t.symbol] ?? emptyListingDraft(t.symbol)}
      stored={storedFor(t.symbol)}
      protonIcon={rowFor(t.symbol, t.precision)?.iconurl}
      busy={busyAny}
      persist={upsertManagerToken}
      onStored={rememberStored}
      github={github[t.symbol] ?? {}}
      githubBusy={githubBusy === t.symbol}
      onCheckGithub={() => void checkGithub(t)}
      onError={(message) => setMsg((m) => ({ ...m, [t.symbol]: { err: message } }))}
      onNote={(message) => setCheckNote(message)}
    />
  );

  const checkRow = (t: TokenRef) => {
    const d = drafts[t.symbol] ?? emptyListingDraft(t.symbol);
    const sq = storedFor(t.symbol);
    const live = rowFor(t.symbol, t.precision);
    const status = live ? "listed" : protonListingStatus(sq);
    const label = live || status === "listed" ? "On token.proton" : status === "missing" ? "Not on token.proton" : "Not checked yet";
    const missing = !live;
    return (
      <li key={`${t.symbol}:${t.precision}`} className="rounded-xl border border-border bg-background/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <TokenIcon contract={actor ?? ""} symbol={t.symbol} src={d.iconurl || live?.iconurl} size={36} rounded="xl" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-bold">
              {t.symbol} <span className="text-muted-foreground">{t.precision} decimals</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {d.tname || t.symbol} · {label}
              {live?.id != null ? ` · id ${live.id}` : ""}
              {sq?.protonCheckedAt ? ` · ${new Date(sq.protonCheckedAt).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busyAny}
              onClick={() => void checkTokens(t)}
            >
              {checking === t.symbol ? "Checking…" : "Check"}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busyAny}
              onClick={() => void sign(t.symbol, t.precision)}
            >
              {signing === t.symbol ? "Signing…" : missing ? "Sign token.proton::reg" : "Sign token.proton::update"}
            </button>
            {!missing ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busyAny}
                onClick={() => void remove(t.symbol, t.precision)}
              >
                {removing === t.symbol ? "Removing…" : "Sign token.proton::remove"}
              </button>
            ) : null}
          </div>
        </div>
        {msg[t.symbol]?.tx && msg[t.symbol]?.tx !== "ok" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {msg[t.symbol]?.tx?.startsWith("http") || msg[t.symbol]?.tx?.includes("PR") ? (
              msg[t.symbol]?.tx
            ) : (
              <>
                tx <TxLink tx={msg[t.symbol]?.tx ?? ""} />
              </>
            )}
          </p>
        ) : null}
        {msg[t.symbol]?.err ? <p className="mt-2 text-xs font-medium text-destructive">{msg[t.symbol]?.err}</p> : null}
        {places(t)}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Edit listing and rain</summary>
          <div className="mt-3">
            <ListingPacket
              contract={actor ?? ""}
              symbol={t.symbol}
              precision={t.precision}
              program={program}
              draft={d}
              onChange={(p) => patchDraft(t.symbol, p)}
              protonOn={!missing}
              canSign
              missing={missing}
              signing={signing === t.symbol}
              removing={removing === t.symbol}
              disabled={busyAny}
              onSign={() => void sign(t.symbol, t.precision)}
              onRemove={!missing ? () => void remove(t.symbol, t.precision) : undefined}
              submitLabel={missing ? "Sign token.proton::reg" : "Sign token.proton::update"}
              msg={msg[t.symbol]}
            />
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <RainDefaultsFields
                value={rain[t.symbol] ?? rainFromRow(null)}
                precision={t.precision}
                symbol={t.symbol}
                disabled={rainSaving != null}
                onChange={(next) => setRain((r) => ({ ...r, [t.symbol]: next }))}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={rainSaving != null}
                onClick={() => void saveRain(t.symbol, t.precision)}
              >
                {rainSaving === t.symbol ? "Saving…" : "Save reflection minimums"}
              </button>
              {rainMsg[t.symbol] ? <p className="text-xs text-muted-foreground">{rainMsg[t.symbol]}</p> : null}
            </div>
          </div>
        </details>
      </li>
    );
  };

  const listedCard = (t: TokenRef) => {
    const d = drafts[t.symbol] ?? emptyListingDraft(t.symbol);
    return (
      <li key={`${t.symbol}:${t.precision}`} className="rounded-xl border border-border bg-background/40 p-4">
        <ListingPacket
          contract={actor ?? ""}
          symbol={t.symbol}
          precision={t.precision}
          program={program}
          draft={d}
          onChange={(p) => patchDraft(t.symbol, p)}
          protonOn
          canSign
          missing={false}
          signing={signing === t.symbol}
          removing={removing === t.symbol}
          disabled={busyAny}
          onSign={() => void sign(t.symbol, t.precision)}
          onRemove={() => void remove(t.symbol, t.precision)}
          submitLabel="Sign token.proton::update"
          msg={msg[t.symbol]}
        />
        {places(t)}
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <RainDefaultsFields
            value={rain[t.symbol] ?? rainFromRow(null)}
            precision={t.precision}
            symbol={t.symbol}
            disabled={rainSaving != null}
            onChange={(next) => setRain((r) => ({ ...r, [t.symbol]: next }))}
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={rainSaving != null}
            onClick={() => void saveRain(t.symbol, t.precision)}
          >
            {rainSaving === t.symbol ? "Saving…" : "Save reflection minimums"}
          </button>
          {rainMsg[t.symbol] ? <p className="text-xs text-muted-foreground">{rainMsg[t.symbol]}</p> : null}
        </div>
      </li>
    );
  };

  const manualBox = (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">Add a symbol by hand</p>
      <p className="text-xs text-muted-foreground">
        Use this if launches, create history, or the database missed a token that already has a stat row.
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
        {program ? ` (${program})` : ""}. Check token.proton live before signing (reg vs update vs remove). Match is
        contract + ticker, not precision. Alcor and eos-airdrops checks read the public GitHub files. PRs go out from
        the dougbutner forks after a sync with upstream. Set GITHUB_TOKEN on the server (repo scope).
      </p>
      <div className="mt-4">
        <AdminSandboxToggle />
      </div>
      <AdminDatabase account={actor ?? ""} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busyAny} onClick={() => void load()}>
          {busy ? "Loading…" : "Refresh list"}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {tokens.length === 0 ? <div className="mt-8">{manualBox}</div> : null}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Check the tokens</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Tokens this contract knows about that are missing from token.proton, or that have not been checked yet.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busyAny || tokens.length === 0}
          onClick={() => void checkTokens()}
        >
          {checking === "all" ? "Checking…" : "Check all on token.proton"}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busyAny || githubBusy != null || tokens.length === 0}
          onClick={() =>
            void (async () => {
              for (const t of tokens) await checkGithub(t);
            })()
          }
        >
          {githubBusy ? "Checking GitHub…" : "Check all on GitHub"}
        </button>
        {checkNote ? <span className="text-xs text-muted-foreground">{checkNote}</span> : null}
      </div>
      {unchecked.length === 0 && !busy ? (
        <p className="mt-2 text-sm text-muted-foreground">Every known token is marked listed, or the list is empty.</p>
      ) : busy && tokens.length === 0 ? (
        <AdminListSkeleton />
      ) : (
        <ul className="mt-3 space-y-3">{unchecked.map((t) => checkRow(t))}</ul>
      )}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted-foreground">Already on token.proton</h2>
      {synced.length === 0 && !busy ? (
        <p className="mt-2 text-sm text-muted-foreground">None cached yet. Run a check first.</p>
      ) : busy && tokens.length === 0 ? (
        <AdminListSkeleton />
      ) : (
        <ul className="mt-3 space-y-3">{synced.map((t) => listedCard(t))}</ul>
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
