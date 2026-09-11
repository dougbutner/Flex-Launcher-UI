import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TxLink } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { HolderPrefs } from "@/components/token/HolderPrefs";
import { IssuerTools } from "@/components/token/IssuerTools";
import {
  alcorSwapUrl,
  explorerAccount,
  flexMeta,
  hasAngelChannels,
  programFromAccount,
} from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import {
  readFlexers,
  readFlexpools,
  readLaunch,
  readSettings,
  readStat,
} from "@/services/flexTables";
import {
  checklockAction,
  payoutAction,
  pullangelAction,
  pulljackpotAction,
} from "@/services/launchActions";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) if (row[k] != null) return row[k];
  return undefined;
}

function fmt(n: number, precision = 4): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: precision });
}

export default function Token() {
  const { contract = "", symbol = "" } = useParams<{ contract: string; symbol: string }>();
  const code = contract.trim().toLowerCase();
  const sym = symbol.trim().toUpperCase();
  const program = programFromAccount(code);
  const { actor, isLoggedIn, addWebAuthWallet, transact } = useWallet();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [launch, setLaunch] = useState<Record<string, unknown> | null>(null);
  const [stat, setStat] = useState<Record<string, unknown> | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [pools, setPools] = useState<Record<string, unknown>[]>([]);
  const [flexer, setFlexer] = useState<Record<string, unknown> | null>(null);
  const [poking, setPoking] = useState<string | null>(null);
  const [pokeMsg, setPokeMsg] = useState<{ tx?: string; err?: string }>({});

  const load = useCallback(async () => {
    if (!code || !sym || !program) return;
    setBusy(true);
    setError("");
    try {
      const [l, s, conf, fp, flexers] = await Promise.all([
        readLaunch(code, sym),
        readStat(code, sym),
        readSettings(code, sym),
        readFlexpools(code, sym).catch(() => [] as Record<string, unknown>[]),
        actor
          ? readFlexers(code, sym, 500).catch(() => [] as Record<string, unknown>[])
          : Promise.resolve([] as Record<string, unknown>[]),
      ]);
      setLaunch(l);
      setStat(s);
      setSettings(conf);
      setPools(fp);
      setFlexer(actor ? (flexers.find((f) => String(pick(f, "owner")) === actor) ?? null) : null);
    } catch (err) {
      setError(txErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [actor, code, program, sym]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!program || !sym) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-black tracking-tight">Unknown token</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Need a flex contract account and symbol code (e.g. /token/for3x/FOO).
        </p>
        <Link to="/leaderboard" className="btn btn-outline btn-sm mt-6">
          Leaderboard
        </Link>
      </div>
    );
  }

  const meta = flexMeta(program);
  const issuer = String(pick(stat, "issuer") ?? "");
  const isIssuer = Boolean(actor && issuer && actor === issuer);
  const precision = parseAsset(String(pick(stat, "supply") ?? ""))?.precision ?? 4;
  const quote = pick(launch, "quote") as { quantity?: string; contract?: string } | undefined;
  const quoteSymbol = parseAsset(quote?.quantity ?? "")?.symbol ?? "";
  const quoteContract = quote?.contract ?? "";
  const reflectionPool = assetAmountNumber(String(pick(stat, "reflection_pool") ?? "0"));
  const angelPool = assetAmountNumber(String(pick(stat, "angel_numbers_pool") ?? "0"));
  const jackpotPool = assetAmountNumber(String(pick(stat, "jackpot_pool") ?? "0"));
  const launched = Boolean(pick(launch, "launched"));

  const poke = async (kind: "rain" | "checklock" | "pullangel" | "pulljackpot") => {
    if (!actor) return;
    setPoking(kind);
    setPokeMsg({});
    try {
      const action =
        kind === "rain"
          ? payoutAction(code, sym, actor, meta.payoutSigner)
          : kind === "checklock"
            ? checklockAction(code, sym)
            : kind === "pullangel"
              ? pullangelAction(code, sym)
              : pulljackpotAction(code, sym);
      const res = await transact([action]);
      setPokeMsg({ tx: txIdFromResult(res) || "ok" });
      void load();
    } catch (err) {
      const msg = txErrorMessage(err);
      const hint = hintForError(msg);
      setPokeMsg({ err: hint ? `${msg} - ${hint}` : msg });
    } finally {
      setPoking(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            <Link to="/portfolio" className="link">
              Portfolio
            </Link>
            {" · "}
            <Link to="/leaderboard" className="link">
              Leaderboard
            </Link>
          </p>
          <div className="mt-1 flex items-center gap-3">
            <TokenIcon contract={code} symbol={sym} size={48} rounded="xl" />
            <h1 className="font-mono text-3xl font-black tracking-tight">${sym}</h1>
            {isLoggedIn && actor ? (
              <button
                type="button"
                className="btn-rain btn-sm"
                disabled={poking != null || !launched}
                onClick={() => void poke("rain")}
              >
                {poking === "rain" ? "Signing…" : "Make it rain"}
              </button>
            ) : (
              <button type="button" className="btn-rain btn-sm" onClick={() => void addWebAuthWallet()}>
                Make it rain
              </button>
            )}
            {pokeMsg.tx ? <TxLink tx={pokeMsg.tx} prefix="tx " /> : null}
            {quoteSymbol ? (
              <TokenIcon contract={quoteContract} symbol={quoteSymbol} size={28} />
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {program} @{" "}
            <a href={explorerAccount(code)} target="_blank" rel="noopener noreferrer" className="link font-mono">
              {code}
            </a>
            {issuer ? (
              <>
                {" · issuer "}
                <a href={explorerAccount(issuer)} target="_blank" rel="noopener noreferrer" className="link font-mono">
                  {issuer}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

      {!launch && !busy ? (
        <p className="mt-6 text-sm text-muted-foreground">No launches row for this symbol on {code}.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className={launched ? "chip-success" : "chip-muted"}>
              {launched ? "launched" : "wizard in progress"}
            </span>
            {quoteSymbol ? <span className="chip-muted">quote {quoteSymbol}</span> : null}
            {Boolean(pick(launch, "swap_underlying_default")) && quoteSymbol ? (
              <span className="chip-muted">→ {quoteSymbol} default</span>
            ) : null}
            <span className="chip-muted">pool {fmt(reflectionPool, precision)}</span>
            {hasAngelChannels(program) ? (
              <>
                <span className={angelPool > 0 ? "chip-primary" : "chip-muted"}>
                  angel {fmt(angelPool, precision)}
                </span>
                <span className={jackpotPool > 0 ? "chip-primary" : "chip-muted"}>
                  jackpot {fmt(jackpotPool, precision)}
                </span>
              </>
            ) : null}
            {Boolean(pick(settings, "dist_locked")) ? <span className="chip-muted">dist locked</span> : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isLoggedIn && actor ? (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={poking != null}
                  onClick={() => void poke("checklock")}
                >
                  {poking === "checklock" ? "Signing…" : "Check lock"}
                </button>
                {hasAngelChannels(program) ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={poking != null || angelPool <= 0}
                      onClick={() => void poke("pullangel")}
                    >
                      {poking === "pullangel" ? "Signing…" : "Pull angel"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={poking != null || jackpotPool <= 0}
                      onClick={() => void poke("pulljackpot")}
                    >
                      {poking === "pulljackpot" ? "Signing…" : "Pull jackpot"}
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void addWebAuthWallet()}>
                Connect to manage
              </button>
            )}
            {quoteSymbol ? (
              <a
                href={alcorSwapUrl(quoteSymbol, quoteContract, sym, code)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm"
              >
                Swap
              </a>
            ) : null}
            {pokeMsg.tx ? <TxLink tx={pokeMsg.tx} prefix="tx " /> : null}
            {pokeMsg.err ? <span className="text-xs text-destructive">{pokeMsg.err}</span> : null}
          </div>

          {isLoggedIn && actor ? (
            <div className="mt-6 space-y-4">
              <HolderPrefs
                program={program}
                contract={code}
                symbol={sym}
                precision={precision}
                actor={actor}
                flexer={flexer}
                settings={settings}
                pools={pools}
                busy={busy || poking != null}
                transact={transact}
                onDone={() => void load()}
              />
              {isIssuer ? (
                <IssuerTools
                  program={program}
                  contract={code}
                  symbol={sym}
                  precision={precision}
                  actor={actor ?? ""}
                  settings={settings}
                  busy={busy || poking != null}
                  transact={transact}
                  onDone={() => void load()}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Issuer tools appear when you sign as {issuer || "the issuer"}.
                </p>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
