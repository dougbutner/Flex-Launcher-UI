import { useEffect, useMemo, useRef, useState } from "react";
import { Field, TxLink } from "@/components/launch/ui";
import { FormPanelSkeleton } from "@/components/ui/PageSkeletons";
import { Pulse } from "@/components/ui/Pulse";
import { PROJECT_CORE_TOKENS } from "@/config/launch";
import { AIRDROP_AUDIENCES } from "@/data/airdropAudiences";
import { validAccount } from "@/services/assets";
import {
  AIRDROP_BATCH,
  airdropTransfers,
  batchCount,
  batchOf,
  budgetToRaw,
  clampMemo,
  corePrecision,
  debitForSend,
  formatRaw,
  formatRawFace,
  formatRawPretty,
  holdersFitInRam,
  isDroppableToken,
  loadAirdropHolders,
  MEMO_MAX_BYTES,
  parseAccountCount,
  planDrop,
  ramPerNewHolder,
  readBalanceRaw,
  readDropTax,
  readFreeRam,
  sortOwnedFirst,
  tokenKey,
  utf8Bytes,
  type AirdropHolder,
  type DropMode,
  type IssuedRef,
  type PlannedDrop,
  type TaxBps,
  type WalletDrop,
} from "@/services/airdrop";
import type { ChainAction } from "@/services/launchActions";
import { getTokens } from "@/services/rpc";
import { hintForError, txErrorMessage, txIdFromResult } from "@/services/txParse";

const STORAGE_URL = "https://resources.xprnetwork.org/storage";
const RESOURCES_URL = "https://resources.xprnetwork.org/";
const ZERO_TAX: TaxBps = { reflection: 0, burn: 0, project: 0 };

type Audience = IssuedRef & { owned: boolean };

function walletPrecision(symbol: string, contract: string, decimals?: number): number {
  if (Number.isInteger(decimals) && (decimals as number) >= 0 && (decimals as number) <= 8) return decimals as number;
  return corePrecision(contract, symbol) ?? 4;
}

function rawFromTokenAmount(amount: unknown, precision: number): bigint {
  if (typeof amount === "string") return budgetToRaw(amount, precision) ?? 0n;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
    return budgetToRaw(amount.toFixed(precision), precision) ?? 0n;
  }
  return 0n;
}

function buildAudience(issued: IssuedRef[], wallet: WalletDrop[]): Audience[] {
  const map = new Map<string, Audience>();
  for (const row of issued) {
    if (!isDroppableToken(row.contract, row.symbol)) continue;
    const symbol = row.symbol.trim().toUpperCase();
    map.set(tokenKey(row.contract, symbol), { contract: row.contract, symbol, precision: row.precision, owned: true });
  }
  for (const row of PROJECT_CORE_TOKENS) {
    const key = tokenKey(row.contract, row.symbol);
    if (map.has(key)) continue;
    map.set(key, {
      contract: row.contract,
      symbol: row.symbol,
      precision: corePrecision(row.contract, row.symbol) ?? 4,
      owned: false,
    });
  }
  for (const row of wallet) {
    const key = tokenKey(row.contract, row.symbol);
    const cur = map.get(key);
    if (!cur) map.set(key, { contract: row.contract, symbol: row.symbol, precision: row.precision, owned: row.owned });
    else if (row.owned) cur.owned = true;
  }
  for (const row of AIRDROP_AUDIENCES) {
    const key = tokenKey(row.contract, row.symbol);
    if (map.has(key)) continue;
    map.set(key, { contract: row.contract, symbol: row.symbol, precision: row.precision, owned: false });
  }
  return sortOwnedFirst([...map.values()]);
}

function pct(bps: number): string {
  const whole = bps / 100;
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function AirdropPanel(props: {
  actor: string;
  issued: IssuedRef[];
  transact: (actions: ChainAction[]) => Promise<unknown>;
  onConnect: () => void;
}) {
  const { actor, issued, transact, onConnect } = props;
  const [wallet, setWallet] = useState<WalletDrop[] | null>(null);
  const [walletError, setWalletError] = useState("");
  const [dropKey, setDropKey] = useState("");
  const [audienceKey, setAudienceKey] = useState("");
  const [budget, setBudget] = useState("");
  const [mode, setMode] = useState<DropMode>("uniform");
  const [countStr, setCountStr] = useState("100");
  const [memo, setMemo] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [holders, setHolders] = useState<AirdropHolder[] | null>(null);
  const [holdersBusy, setHoldersBusy] = useState(false);
  const [holdersMsg, setHoldersMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState(0);
  const [freeRam, setFreeRam] = useState<number | null>(null);
  const [tax, setTax] = useState<TaxBps>(ZERO_TAX);
  const [optedOut, setOptedOut] = useState(false);
  const [signing, setSigning] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [tx, setTx] = useState("");
  const [msg, setMsg] = useState("");
  const [frozen, setFrozen] = useState<PlannedDrop[] | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  const issuedKey = issued.map((row) => tokenKey(row.contract, row.symbol)).join("|");

  const loadWallet = async () => {
    setWalletError("");
    try {
      const rows = await getTokens(actor);
      const owned = new Set(issued.map((row) => tokenKey(row.contract, row.symbol)));
      const next: WalletDrop[] = [];
      for (const row of rows) {
        const contract = String(row.contract || "").trim();
        const symbol = String(row.symbol || "").trim().toUpperCase();
        if (!isDroppableToken(contract, symbol)) continue;
        const precision = walletPrecision(symbol, contract, row.precision ?? row.decimals);
        const balanceRaw = rawFromTokenAmount(row.amount, precision);
        if (balanceRaw <= 0n) continue;
        next.push({
          contract,
          symbol,
          precision,
          balanceRaw,
          owned: owned.has(tokenKey(contract, symbol)),
        });
      }
      const sorted = sortOwnedFirst(next);
      setWallet(sorted);
      setDropKey((cur) => {
        if (cur && sorted.some((row) => tokenKey(row.contract, row.symbol) === cur)) return cur;
        const first = sorted[0];
        return first ? tokenKey(first.contract, first.symbol) : "";
      });
    } catch (err) {
      setWalletError(txErrorMessage(err));
      setWallet([]);
    }
  };

  useEffect(() => {
    if (!actor) {
      setWallet([]);
      setWalletError("");
      return;
    }
    void loadWallet();
    // issuedKey tracks the issuer list. loadWallet closes over the matching issued rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, issuedKey]);

  useEffect(() => {
    if (!actor) {
      setFreeRam(null);
      return;
    }
    let live = true;
    void readFreeRam(actor)
      .then((free) => {
        if (live) setFreeRam(free);
      })
      .catch(() => {
        if (live) setFreeRam(null);
      });
    return () => {
      live = false;
    };
  }, [actor, tx]);

  const drop = wallet?.find((row) => tokenKey(row.contract, row.symbol) === dropKey) ?? null;
  const audienceOptions = useMemo(() => buildAudience(issued, wallet ?? []), [issued, wallet]);
  const audience = audienceOptions.find((row) => tokenKey(row.contract, row.symbol) === audienceKey) ?? null;

  useEffect(() => {
    setAudienceKey((cur) => {
      if (cur && audienceOptions.some((row) => tokenKey(row.contract, row.symbol) === cur)) return cur;
      const first = audienceOptions[0];
      return first ? tokenKey(first.contract, first.symbol) : "";
    });
  }, [audienceOptions]);

  useEffect(() => {
    if (!drop) {
      setTax(ZERO_TAX);
      setOptedOut(false);
      return;
    }
    let live = true;
    void readDropTax(drop.contract, drop.symbol, actor)
      .then((row) => {
        if (!live) return;
        setTax(row.tax);
        setOptedOut(row.optedOut);
      })
      .catch(() => {
        if (!live) return;
        setTax(ZERO_TAX);
        setOptedOut(false);
      });
    return () => {
      live = false;
    };
  }, [drop?.contract, drop?.symbol, actor]);

  const count = parseAccountCount(countStr);
  const budgetRaw = drop ? budgetToRaw(budget, drop.precision) : null;

  useEffect(() => {
    if (!audience || count == null) {
      setHolders(null);
      setHoldersBusy(false);
      setHoldersMsg("");
      return;
    }
    const ctrl = new AbortController();
    setHoldersBusy(true);
    setHolders(null);
    setProgress(0);
    setTruncated(false);
    setExcluded(new Set());
    setSent(new Set());
    setFrozen(null);
    setBatch(0);
    setTx("");
    setMsg("");
    setHoldersMsg("");
    void loadAirdropHolders({
      contract: audience.contract,
      symbol: audience.symbol,
      precision: audience.precision,
      count,
      sender: actor,
      skipContracts: [audience.contract, drop?.contract].filter((name): name is string => Boolean(name)),
      signal: ctrl.signal,
      onProgress: (n) => setProgress(n),
    })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        setHolders(res.holders);
        setTruncated(res.truncated);
        if (res.holders.length === 0) setHoldersMsg("No holder balances came back for that token.");
        else if (res.short) setHoldersMsg(`This token has ${res.holders.length.toLocaleString()} holders with a balance. The drop uses ${res.holders.length.toLocaleString()}.`);
      })
      .catch((err) => {
        if (ctrl.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setHolders([]);
        setHoldersMsg(txErrorMessage(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setHoldersBusy(false);
      });
    return () => ctrl.abort();
  }, [audience?.contract, audience?.symbol, audience?.precision, drop?.contract, count, actor]);

  const livePlan = useMemo(() => (holders ? planDrop(mode, budgetRaw ?? 0n, holders) : null), [holders, budgetRaw, mode]);
  const plan = frozen ?? livePlan;
  const priced = budgetRaw != null;
  const rawSum = plan ? plan.reduce((sum, row) => sum + row.amountRaw, 0n) : 0n;
  const shownSum =
    !plan || mode === "uniform"
      ? (plan?.[0]?.amountRaw ?? 0n) * BigInt(plan?.length ?? 0)
      : budgetRaw != null && rawSum <= budgetRaw && budgetRaw - rawSum < BigInt(Math.max(plan.length, 1))
        ? budgetRaw
        : rawSum;

  const pages = plan ? batchCount(plan.length) : 0;
  const page = plan ? Math.min(batch, Math.max(0, pages - 1)) : 0;
  const visible = plan ? batchOf(plan, page) : [];
  const ramFit = freeRam == null || !drop ? null : holdersFitInRam(freeRam, ramPerNewHolder(drop.contract));

  const toggle = (account: string) => {
    setExcluded((cur) => {
      const next = new Set(cur);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  };

  const checkBatch = () => {
    setExcluded((cur) => {
      const next = new Set(cur);
      for (const row of visible) next.delete(row.account);
      return next;
    });
  };

  const uncheckBatch = () => {
    setExcluded((cur) => {
      const next = new Set(cur);
      for (const row of visible) next.add(row.account);
      return next;
    });
  };

  const testSend = async () => {
    if (!drop || !actor) return;
    const to = testTo.trim().toLowerCase();
    if (!validAccount(to)) {
      setTx("");
      setMsg("Enter an account name.");
      return;
    }
    if (to === "vibrrairdrop" && memo.trim() !== "create_airdrop" && !/^airdrop_deposit:\d+$/.test(memo.trim())) {
      setTx("");
      setMsg("vibrrairdrop only accepts memo create_airdrop, or airdrop_deposit:<id>. Holder drops skip that account.");
      return;
    }
    setTestBusy(true);
    setMsg("");
    setTx("");
    try {
      const amountRaw = 1n;
      const fresh = await readBalanceRaw(drop.contract, actor, drop.symbol, drop.precision);
      const debit = debitForSend(amountRaw, tax, optedOut);
      if (debit > fresh) {
        setWallet((cur) =>
          (cur ?? []).map((row) => (tokenKey(row.contract, row.symbol) === dropKey ? { ...row, balanceRaw: fresh } : row))
        );
        setMsg("Your balance does not cover a dust send.");
        return;
      }
      const actions =
        to === "vibrrairdrop"
          ? [
              {
                account: drop.contract,
                name: "transfer",
                data: {
                  from: actor,
                  to,
                  quantity: formatRaw(amountRaw, drop.precision, drop.symbol),
                  memo: clampMemo(memo.trim()),
                },
              },
            ]
          : airdropTransfers({
              contract: drop.contract,
              from: actor,
              precision: drop.precision,
              symbol: drop.symbol,
              memo,
              rows: [{ account: to, amountRaw }],
            });
      if (!actions.length) {
        setMsg("That account cannot receive this drop.");
        return;
      }
      const res = await transact(actions);
      setTx(txIdFromResult(res) || "ok");
      setMsg("Test send");
      setWallet((cur) =>
        (cur ?? []).map((row) =>
          tokenKey(row.contract, row.symbol) === dropKey ? { ...row, balanceRaw: fresh - debit } : row
        )
      );
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg(hint ? `${text} - ${hint}` : text);
    } finally {
      setTestBusy(false);
    }
  };

  const checked = visible.filter(
    (row) => priced && row.amountRaw > 0n && !excluded.has(row.account) && !sent.has(row.account)
  );
  const sendSum = checked.reduce((sum, row) => sum + row.amountRaw, 0n);
  const debitSum = checked.reduce((sum, row) => sum + debitForSend(row.amountRaw, tax, optedOut), 0n);
  const taxOn = !optedOut && (tax.reflection > 0 || tax.burn > 0 || tax.project > 0);
  const shortBalance = drop != null && debitSum > drop.balanceRaw;

  const sign = async () => {
    if (!drop || !checked.length) return;
    setSigning(true);
    setMsg("");
    setTx("");
    try {
      const fresh = await readBalanceRaw(drop.contract, actor, drop.symbol, drop.precision);
      const debit = checked.reduce((sum, row) => sum + debitForSend(row.amountRaw, tax, optedOut), 0n);
      if (debit > fresh) {
        setWallet((cur) =>
          (cur ?? []).map((row) => (tokenKey(row.contract, row.symbol) === dropKey ? { ...row, balanceRaw: fresh } : row))
        );
        setMsg("Your balance does not cover this batch plus tax. Lower the amount or uncheck accounts.");
        return;
      }
      const res = await transact(
        airdropTransfers({
          contract: drop.contract,
          from: actor,
          precision: drop.precision,
          symbol: drop.symbol,
          memo,
          rows: checked,
        })
      );
      const id = txIdFromResult(res) || "ok";
      setTx(id);
      if (plan) setFrozen(plan);
      setSent((cur) => {
        const next = new Set(cur);
        for (const row of checked) next.add(row.account);
        return next;
      });
      setWallet((cur) =>
        (cur ?? []).map((row) =>
          tokenKey(row.contract, row.symbol) === dropKey ? { ...row, balanceRaw: fresh - debit } : row
        )
      );
      if (page + 1 < pages) setBatch(page + 1);
    } catch (err) {
      const text = txErrorMessage(err);
      const hint = hintForError(text);
      setMsg(hint ? `${text} - ${hint}` : text);
    } finally {
      setSigning(false);
    }
  };

  if (wallet == null && !walletError) {
    return (
      <section className="card mt-6 p-6">
        <FormPanelSkeleton />
      </section>
    );
  }

  return (
    <section className="card mt-6 space-y-5 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          You cover the RAM for receivers who do not already hold the token you drop.
        </p>
        {actor ? (
          <button type="button" className="link text-xs" onClick={() => void loadWallet()}>
            Refresh balances
          </button>
        ) : (
          <button type="button" className="link text-xs" onClick={onConnect}>
            Connect wallet
          </button>
        )}
      </div>
      {walletError ? <p className="text-sm text-destructive">{walletError}</p> : null}

      <Field
        label="Token to drop"
        hint="Issued tokens are listed first, then any balance you hold from the saved list."
      >
        <select
          className="input"
          value={dropKey}
          disabled={frozen != null || !actor}
          onChange={(e) => {
            setDropKey(e.target.value);
            setBudget("");
            setTx("");
            setMsg("");
          }}
        >
          {!actor ? <option value="">Connect to see balances</option> : null}
          {actor && wallet && wallet.length === 0 ? <option value="">No eligible balance</option> : null}
          {(wallet ?? []).map((row) => (
            <option key={tokenKey(row.contract, row.symbol)} value={tokenKey(row.contract, row.symbol)}>
              {row.owned ? "Yours · " : ""}
              {row.symbol} @ {row.contract} · {formatRawPretty(row.balanceRaw, row.precision, row.symbol)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Drop to holders of" hint="X tokens, plus tokens with over $100 of XPR in an Alcor pool. That list is saved.">
        <select className="input" value={audienceKey} disabled={frozen != null} onChange={(e) => setAudienceKey(e.target.value)}>
          {audienceOptions.map((row) => (
            <option key={tokenKey(row.contract, row.symbol)} value={tokenKey(row.contract, row.symbol)}>
              {row.owned ? "Yours · " : ""}
              {row.symbol} @ {row.contract}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={mode === "uniform" ? "Per account drop" : "Total drop"}
          hint={
            !drop
              ? "Pick a token first."
              : mode === "uniform"
                ? `Each account receives this much ${drop.symbol}.`
                : `Split this ${drop.symbol} by holding size.`
          }
        >
          <input
            className="input font-mono"
            inputMode="decimal"
            value={budget}
            disabled={!drop || frozen != null}
            placeholder={drop ? `0 ${drop.symbol}` : "0"}
            onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </Field>
        <Field
          label="Accounts"
          hint={count == null ? "Whole number from 100 to 10,000." : "Top holders, largest first. Batches are 100."}
        >
          <input
            className="input font-mono"
            inputMode="numeric"
            value={countStr}
            disabled={frozen != null}
            onChange={(e) => setCountStr(e.target.value.replace(/\D/g, "").slice(0, 5))}
          />
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="label mb-0">Distribution</span>
          <button type="button" className={`text-[11px] uppercase tracking-[0.22em] ${mode === "uniform" ? "text-primary" : "text-muted-foreground hover:text-foreground/80"}`} disabled={frozen != null} onClick={() => setMode("uniform")}>
            Simple
          </button>
          <button type="button" className={`text-[11px] uppercase tracking-[0.22em] ${mode === "proportional" ? "text-primary" : "text-muted-foreground hover:text-foreground/80"}`} disabled={frozen != null} onClick={() => setMode("proportional")}>
            Proportional
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {mode === "uniform"
            ? "Each account receives the amount you enter."
            : "Each account's share follows their balance over the whole list. Later batches keep those amounts."}
        </p>
      </div>

      <Field label="Memo" hint={`${utf8Bytes(memo)}/${MEMO_MAX_BYTES} bytes. The chain rejects a longer memo.`}>
        <textarea
          className="input min-h-[72px] resize-y"
          value={memo}
          maxLength={MEMO_MAX_BYTES}
          onChange={(e) => setMemo(clampMemo(e.target.value))}
        />
      </Field>

      <div>
        <button type="button" className="link text-xs" onClick={() => setTestOpen((v) => !v)}>
          Test send
        </button>
        {testOpen ? (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-muted-foreground">Test with a dust send to see how your memo works</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="input max-w-[16rem] font-mono"
                value={testTo}
                placeholder="account"
                onChange={(e) => setTestTo(e.target.value.toLowerCase().replace(/[^a-z1-5.]/g, "").slice(0, 12))}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={testBusy || !drop || !actor || !validAccount(testTo.trim())}
                onClick={() => void testSend()}
              >
                {testBusy ? "Signing…" : "Send"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {ramFit == null ? (
            actor ? "Reading your free RAM." : "Connect to read free RAM."
          ) : (
            <>
              Free RAM can open about {ramFit.toLocaleString()} new holder rows.{" "}
              <a className="link" href={STORAGE_URL} target="_blank" rel="noreferrer">
                Buy RAM
              </a>
              .
            </>
          )}
        </p>
        <button type="button" className="link text-[11px] font-semibold uppercase tracking-wider" onClick={() => setInfoOpen((v) => !v)}>
          info
        </button>
      </div>
      {infoOpen ? (
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>You pay RAM when the receiver has no balance row for this token yet. Someone who already holds it does not take a new row.</p>
          <p>
            The estimate divides free RAM by about {drop ? ramPerNewHolder(drop.contract).toLocaleString() : "360"} bytes for a new balance and holder row. It is a ceiling. If a transfer fails for RAM, buy storage and sign that batch again.
          </p>
          <p>You sign each batch yourself. One transaction sends to the checked accounts, 100 at a time.</p>
          <p>Unchecking an account skips it. Simple sends the per account amount to each checked account. Proportional amounts stay fixed from the total and the list.</p>
          <p>Wallet to wallet transfers can add tax on top of what the receiver gets. Your balance has to cover the send plus that tax. Fee opt-out skips the tax.</p>
          <p>Your own account, the token contract, swap.alcor, and vibrrairdrop are left off. A transfer to yourself fails. vibrrairdrop only accepts memo create_airdrop, or airdrop_deposit:&lt;id&gt;.</p>
          <p>
            Balances, RAM, and tax are read from EOSUSA. Holder ranks come from the Light API, because EOSUSA does not publish that list. Flex holder rows past the Light API cap of 1,000 are filled from EOSUSA. Tokens without a flexer table stop at that cap. If the signature fails for CPU or NET, stake more on{" "}
            <a className="link" href={RESOURCES_URL} target="_blank" rel="noreferrer">
              XPR resources
            </a>
            .
          </p>
        </div>
      ) : null}

      {plan && drop && priced && mode === "proportional" && plan.length > 0 && plan.every((row) => row.amountRaw <= 0n) ? (
        <p className="text-xs text-muted-foreground">That total is smaller than one unit for each account.</p>
      ) : plan && drop && priced ? (
        <p className="text-xs text-muted-foreground">
          {mode === "uniform"
            ? `Each account receives ${formatRawFace(plan[0]?.amountRaw ?? 0n, drop.precision, drop.symbol)}.`
            : `Shares are fixed across ${plan.length.toLocaleString()} accounts.`}{" "}
          Planned send {formatRawFace(shownSum, drop.precision, drop.symbol)}.
          {frozen ? (
            <>
              {" "}
              Amounts stay fixed for the rest of this drop.{" "}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setFrozen(null);
                  setSent(new Set());
                  setExcluded(new Set());
                  setBatch(0);
                  setTx("");
                  setMsg("");
                }}
              >
                Start over
              </button>
              .
            </>
          ) : null}
        </p>
      ) : null}
      {taxOn && drop && checked.length ? (
        <p className="text-xs text-muted-foreground">
          Tax on top: reflection {pct(tax.reflection)}%{tax.burn ? `, burn ${pct(tax.burn)}%` : ""}
          {tax.project ? `, project ${pct(tax.project)}%` : ""}. This batch sends{" "}
          {formatRawPretty(sendSum, drop.precision, drop.symbol)} and debits about{" "}
          {formatRawPretty(debitSum, drop.precision, drop.symbol)}.
        </p>
      ) : optedOut && checked.length ? (
        <p className="text-xs text-muted-foreground">Fee opt-out is on, so this drop is not taxed.</p>
      ) : null}
      {holdersMsg ? <p className="text-xs text-muted-foreground">{holdersMsg}</p> : null}
      {truncated ? (
        <p className="text-xs text-warning">
          Light API ranks the top 1,000. This pass did not read every holder row, so ranks after 1,000 can miss a larger balance.
        </p>
      ) : null}
      {shortBalance && drop ? (
        <p className="text-xs text-destructive">
          This batch needs about {formatRawPretty(debitSum, drop.precision, drop.symbol)}. Your balance is{" "}
          {formatRawPretty(drop.balanceRaw, drop.precision, drop.symbol)}.
        </p>
      ) : null}

      {holdersBusy ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-xs text-muted-foreground">
            {mode === "proportional" && (count ?? 0) > AIRDROP_BATCH
              ? "Reading the full list so each share can be set once."
              : "Reading top holders."}
            {progress > 0 ? ` ${progress.toLocaleString()} rows.` : ""}
          </p>
          {Array.from({ length: 6 }).map((_, i) => (
            <Pulse key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : visible.length ? (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Batch {page + 1} of {pages}
            </span>
            <button type="button" className="link text-xs" disabled={page === 0} onClick={() => setBatch(page - 1)}>
              Previous
            </button>
            <button type="button" className="link text-xs" disabled={page + 1 >= pages} onClick={() => setBatch(page + 1)}>
              Next
            </button>
            <button type="button" className="link text-xs" onClick={checkBatch}>
              Check batch
            </button>
            <button type="button" className="link text-xs" onClick={uncheckBatch}>
              Uncheck
            </button>
          </div>
          <ul ref={listRef} className="h-80 min-h-32 max-h-[80vh] resize-y overflow-auto rounded-xl border border-border">
            {visible.map((row) => (
              <HolderRow
                key={row.account}
                row={row}
                drop={drop}
                audience={audience}
                priced={priced}
                checked={!excluded.has(row.account)}
                sent={sent.has(row.account)}
                onToggle={() => toggle(row.account)}
              />
            ))}
          </ul>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
              onClick={() => {
                const el = listRef.current;
                if (el) el.style.height = "80vh";
              }}
            >
              expand
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          className="btn btn-airdrop"
          disabled={signing || holdersBusy || !drop || !checked.length || shortBalance || count == null || budgetRaw == null}
          onClick={() => void sign()}
        >
          <span>{signing ? "Signing…" : "Airdrop"}</span>
          <span className="text-[0.62em] font-bold tabular-nums">{checked.length}/{visible.length || count || 0}</span>
        </button>
      </div>
      {tx ? (
        <p className="text-xs text-muted-foreground">
          {msg === "Test send" ? "Test send" : "Airdrop"} · <TxLink tx={tx} />
        </p>
      ) : msg ? (
        <p className="text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </section>
  );
}

function HolderRow(props: {
  row: PlannedDrop;
  drop: WalletDrop | null;
  audience: Audience | null;
  priced: boolean;
  checked: boolean;
  sent: boolean;
  onToggle: () => void;
}) {
  const { row, drop, audience, priced, checked, sent, onToggle } = props;
  const zero = priced && row.amountRaw <= 0n;
  return (
    <li className="flex items-center gap-2 border-b border-border/70 px-2 py-1.5 text-xs last:border-b-0">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0"
        checked={sent || zero ? false : checked}
        disabled={sent || zero}
        onChange={onToggle}
        aria-label={row.account}
      />
      <span className="min-w-0 flex-1 truncate font-mono">{row.account}</span>
      <span className="max-w-[40%] truncate font-mono text-muted-foreground">
        {audience ? formatRawPretty(row.weightRaw, audience.precision, audience.symbol) : ""}
      </span>
      <span className="w-28 shrink-0 text-right font-mono">
        {sent ? "sent" : priced && drop ? formatRawPretty(row.amountRaw, drop.precision, drop.symbol) : "-"}
      </span>
    </li>
  );
}
