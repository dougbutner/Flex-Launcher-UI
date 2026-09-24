import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ClubFeed, WeekTopPost } from "@/components/insiders/ClubFeed";
import { TxLink } from "@/components/launch/ui";
import { TokenIcon } from "@/components/TokenIcon";
import { SanitySection } from "@/components/token/SanitySection";
import { IssuerTools } from "@/components/token/IssuerTools";
import { PresalePanel } from "@/components/token/PresalePanel";
import { TokenListingCard } from "@/components/token/TokenListingCard";
import { TokenTitleStats } from "@/components/token/TokenMarket";
import { HolderPrefs } from "@/components/token/HolderPrefs";
import { TokenPageSkeleton } from "@/components/ui/PageSkeletons";
import { alcorAnalyticsUrl, explorerAccount, flexMeta, hasAngelChannels, isFlexContractActor, programFromAccount } from "@/config/launch";
import { useWallet } from "@/hooks/useWallet";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import {
  readAccounts,
  readFlexers,
  readFlexpools,
  readInsiders,
  readLaunch,
  readPresale,
  readSettings,
  readStat,
} from "@/services/flexTables";
import {
  checklockAction,
  pullangelAction,
  pulljackpotAction,
} from "@/services/launchActions";
import { listManagerTokens } from "@/services/managerApi";
import { storedPayoutAction } from "@/services/rainDefaults";
import { rememberRemoteTokenIcon } from "@/services/tokenIcons";
import { findProtonTokenRow } from "@/services/tokenProton";
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

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [launch, setLaunch] = useState<Record<string, unknown> | null>(null);
  const [stat, setStat] = useState<Record<string, unknown> | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [pools, setPools] = useState<Record<string, unknown>[]>([]);
  const [flexer, setFlexer] = useState<Record<string, unknown> | null>(null);
  const [presale, setPresale] = useState<Record<string, unknown> | null>(null);
  const [insider, setInsider] = useState<Record<string, unknown> | null>(null);
  const [holderBalRaw, setHolderBalRaw] = useState(0);
  const [poking, setPoking] = useState<string | null>(null);
  const [pokeMsg, setPokeMsg] = useState<{ tx?: string; err?: string }>({});
  const [iconSrc, setIconSrc] = useState("");
  const [sanityEpoch, setSanityEpoch] = useState(0);

  const load = useCallback(async () => {
    if (!code || !sym || !program) return;
    setBusy(true);
    setError("");
    try {
      const [l, s, conf, fp, flexers, ps, ins] = await Promise.all([
        readLaunch(code, sym),
        readStat(code, sym),
        readSettings(code, sym),
        readFlexpools(code, sym).catch(() => [] as Record<string, unknown>[]),
        actor
          ? readFlexers(code, sym, 500).catch(() => [] as Record<string, unknown>[])
          : Promise.resolve([] as Record<string, unknown>[]),
        readPresale(code, sym).catch(() => null),
        actor
          ? readInsiders(code, sym, 500).catch(() => [] as Record<string, unknown>[])
          : Promise.resolve([] as Record<string, unknown>[]),
      ]);
      setLaunch(l);
      setStat(s);
      setSettings(conf);
      setPools(fp);
      setPresale(ps);
      setFlexer(actor ? (flexers.find((f) => String(pick(f, "owner")) === actor) ?? null) : null);
      setInsider(actor ? (ins.find((r) => String(pick(r, "account")) === actor) ?? null) : null);
      if (actor) {
        try {
          const { rows } = await readAccounts(code, actor, sym);
          const bal = parseAsset(String(pick(rows[0], "balance") ?? ""));
          if (bal) {
            const [i = "0", f = ""] = bal.amount.replace("-", "").split(".");
            const frac = (f + "0".repeat(bal.precision)).slice(0, bal.precision);
            setHolderBalRaw(Number(bal.precision <= 0 ? i : `${i}${frac}`) || 0);
          } else setHolderBalRaw(0);
        } catch {
          setHolderBalRaw(0);
        }
      } else setHolderBalRaw(0);
      const prec = parseAsset(String(pick(s, "supply") ?? s?.max_supply ?? ""))?.precision ?? 4;
      const [proton, stored] = await Promise.all([
        findProtonTokenRow(code, prec, sym),
        actor
          ? listManagerTokens(actor === code ? { contract: code } : { issuer: actor }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const sq = stored.find((row) => row.symbol === sym && row.contract === code);
      const url = proton?.iconurl || sq?.imageUrl || "";
      if (url) rememberRemoteTokenIcon(code, sym, url);
      setIconSrc(url);
    } catch (err) {
      setError(txErrorMessage(err));
    } finally {
      setBusy(false);
      setSanityEpoch((n) => n + 1);
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
          Winners
        </Link>
      </div>
    );
  }

  const meta = flexMeta(program);
  const issuer = String(pick(stat, "issuer") ?? "");
  const isIssuer = Boolean(actor && issuer && actor === issuer);
  const isContractAdmin = Boolean(actor && isFlexContractActor(actor) && actor === code);
  const precision = parseAsset(String(pick(stat, "supply") ?? ""))?.precision ?? 4;
  const quote = pick(launch, "quote") as { quantity?: string; contract?: string } | undefined;
  const quoteSymbol = parseAsset(quote?.quantity ?? "")?.symbol ?? "";
  const quoteContract = quote?.contract ?? "";
  const reflectionPool = assetAmountNumber(String(pick(stat, "reflection_pool") ?? "0"));
  const angelPool = assetAmountNumber(String(pick(stat, "angel_numbers_pool") ?? "0"));
  const jackpotPool = assetAmountNumber(String(pick(stat, "jackpot_pool") ?? "0"));
  const launched = Boolean(pick(launch, "launched"));
  const inPresale = Boolean(presale) && !launched && Number(pick(launch, "pure_liquid_alcor_pool_id", "pool_id") ?? 0) > 0;
  const supplyAmt = assetAmountNumber(String(pick(stat, "supply") ?? "0"));
  const maxSupplyAmt = assetAmountNumber(String(pick(stat, "max_supply") ?? "")) || supplyAmt;
  const launchPoolId = Number(pick(launch, "pure_liquid_alcor_pool_id", "pool_id") ?? 0);
  const positionId = Number(pick(launch, "position_id") ?? 0);

  const poke = async (kind: "rain" | "checklock" | "pullangel" | "pulljackpot") => {
    if (!actor) return;
    setPoking(kind);
    setPokeMsg({});
    try {
      const action =
        kind === "rain"
          ? await storedPayoutAction(code, sym, actor, meta.payoutSigner)
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
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            <Link to="/portfolio" className="link">
              My Bags
            </Link>
            {" · "}
            <Link to="/leaderboard" className="link">
              Winners
            </Link>
            {" · "}
            <Link to="/events" className="link">
              Events
            </Link>
          </p>
          <div className="mt-1 flex items-center gap-3">
            <TokenIcon contract={code} symbol={sym} src={iconSrc} size={48} />
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
            {quoteSymbol ? <TokenIcon contract={quoteContract} symbol={quoteSymbol} size={28} /> : null}
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
          <TokenTitleStats
            poolId={launchPoolId}
            contract={code}
            symbol={sym}
            quoteContract={quoteContract}
            quoteSymbol={quoteSymbol}
            supply={supplyAmt}
          />
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="mt-6 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

      {busy && !stat ? (
        <TokenPageSkeleton />
      ) : (
        <>
      <div className="mt-6 flex flex-wrap gap-2">
        <span className={launched ? "chip-success" : inPresale ? "chip-primary" : "chip-muted"}>
          {launched ? "launched" : inPresale ? "insiders" : "wizard in progress"}
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

      {!launch && !busy ? (
        <p className="mt-6 text-sm text-muted-foreground">No launches row for this symbol on {code}.</p>
      ) : (
        <div className="mt-6 grid items-start gap-4 md:grid-cols-3">
          <div className="min-w-0 md:col-span-2">
            <iframe
              title={`${sym} Alcor analytics`}
              src={alcorAnalyticsUrl(sym, code)}
              className="h-[100dvh] max-h-[100dvh] w-full border border-border bg-background"
              allow="clipboard-write"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                  Connect to manage your bags
                </button>
              )}
              {pokeMsg.tx ? <TxLink tx={pokeMsg.tx} prefix="tx " /> : null}
              {pokeMsg.err ? <span className="text-xs text-destructive">{pokeMsg.err}</span> : null}
            </div>
          </div>
          <div className="max-h-[100dvh] min-h-0 overflow-y-auto border border-border bg-background/40 p-3 md:col-span-1">
            <ClubFeed contract={code} symbol={sym} poolId={launchPoolId} initialRange="all" />
            <WeekTopPost />
          </div>
        </div>
      )}

      {launch ? (
        <SanitySection
          contract={code}
          symbol={sym}
          quoteContract={quoteContract}
          quoteSymbol={quoteSymbol}
          poolId={launchPoolId}
          positionId={positionId}
          tickLower={Number(pick(launch, "tick_lower") ?? 0)}
          tickUpper={Number(pick(launch, "tick_upper") ?? 0)}
          sqrtStart={String(pick(launch, "sqrt_price_x64") ?? "0")}
          maxSupply={maxSupplyAmt}
          tokenPrecision={precision}
          reloadKey={sanityEpoch}
        />
      ) : null}

      {presale && !launched ? (
        <PresalePanel
          contract={code}
          symbol={sym}
          precision={precision}
          actor={actor}
          isIssuer={isIssuer || isContractAdmin}
          isLoggedIn={isLoggedIn}
          busy={busy || poking != null}
          launch={launch}
          stat={stat}
          presale={presale}
          insider={insider}
          quoteSymbol={quoteSymbol}
          quoteContract={quoteContract}
          holderBalanceRaw={holderBalRaw}
          onConnect={() => void addWebAuthWallet()}
          transact={transact}
          onDone={() => void load()}
        />
      ) : null}

      {isLoggedIn && actor && (isIssuer || isContractAdmin) ? (
        <div className="mt-6">
          <TokenListingCard
            contract={code}
            symbol={sym}
            precision={precision}
            actor={actor}
            transact={transact}
          />
        </div>
      ) : null}

      {isLoggedIn && actor ? (
        <div className="mt-6">
          <HolderPrefs
            program={program}
            contract={code}
            symbol={sym}
            precision={precision}
            actor={actor}
            flexer={flexer}
            settings={settings}
            pools={pools}
            swapUnderlyingDefault={Boolean(pick(launch, "swap_underlying_default"))}
            quoteSymbol={quoteSymbol}
            busy={busy || poking != null}
            transact={transact}
            onDone={() => void load()}
          />
        </div>
      ) : null}

      {isLoggedIn && actor && isIssuer ? (
        <div className="mt-6 max-w-3xl">
          <IssuerTools
            program={program}
            contract={code}
            symbol={sym}
            precision={precision}
            actor={actor ?? ""}
            settings={settings}
            launch={launch}
            pools={pools}
            busy={busy || poking != null}
            transact={transact}
            onDone={() => void load()}
          />
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
