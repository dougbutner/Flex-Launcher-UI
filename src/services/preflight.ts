import {
  COMPLEXFLEX_CONTRACT,
  EASY_SYMBOL,
  LOCK_MIN_SECONDS,
  MON3Y,
  SWAP_ALCOR,
  easyHoldFlexAltTip,
  easyHoldNeed,
  flexAccount,
  flexMeta,
  holdEasyToLaunch,
  isFlexQuoteToken,
  type FlexProgram,
} from "@/config/launch";
import { assetAmountNumber, parseAsset } from "@/services/assets";
import type { LaunchPlan } from "@/services/launchMath";
import {
  readAlcorBalance,
  readAccounts,
  readLaunch,
  readLaunches,
  readLock,
  readPool,
  readPositions,
  readStat,
} from "@/services/flexTables";

export type PreflightItem = {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
  /** Quiet extra line. Non-flex shortfall points at the Flex-pair hold. */
  hint?: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!row) return undefined;
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return undefined;
}

/** Symbol code from a row value that may be "FOO", "4,FOO", or a symbol object. */
export function symbolCodeOf(v: unknown): string {
  if (v && typeof v === "object") {
    const code = (v as { symbol_code?: string }).symbol_code;
    if (typeof code === "string") return code;
  }
  if (typeof v !== "string") return "";
  const m = v.match(/[A-Z]{1,7}/);
  return m ? m[0] : "";
}

function extMatches(ext: unknown, symbol: string, contract: string): boolean {
  const e = ext as { quantity?: string; contract?: string } | undefined;
  if (!e) return false;
  return e.contract === contract && parseAsset(e.quantity ?? "")?.symbol === symbol;
}

function easyGateFailDetail(need: number): string {
  return `Need ${need.toLocaleString()} EASY before liftoff`;
}

function easyGateHint(args: {
  need: number;
  easyBal: number;
  flexQuote: boolean;
  flexNeed: number;
  pass: boolean;
}): string | undefined {
  if (args.pass || args.flexQuote) return undefined;
  return (
    easyHoldFlexAltTip({
      easyBal: args.easyBal,
      fullNeed: args.need,
      flexNeed: args.flexNeed,
    }) ?? undefined
  );
}

export function createGateItems(args: {
  stat: unknown;
  easyBal: number;
  need: number;
  symbol: string;
  prior: number;
  flexQuote?: boolean;
  flexNeed?: number;
}): PreflightItem[] {
  const taken = Boolean(args.stat);
  const flexQuote = args.flexQuote ?? true;
  const flexNeed = args.flexNeed ?? args.need;
  const pass = args.easyBal + 1e-12 >= args.need;
  const ratio = `${args.easyBal.toLocaleString()} / ${args.need.toLocaleString()} EASY · ${args.prior} prior launch${args.prior === 1 ? "" : "es"}`;
  return [
    {
      id: "ticker",
      label: `${args.symbol} is free on this contract`,
      pass: !taken,
      detail: taken ? "That ticker is taken. Pick another." : "available",
    },
    {
      id: "easy",
      label: holdEasyToLaunch(args.need),
      pass,
      detail: pass ? ratio : easyGateFailDetail(args.need),
      hint: easyGateHint({
        need: args.need,
        easyBal: args.easyBal,
        flexQuote,
        flexNeed,
        pass,
      }),
    },
  ];
}

export async function runCreateGates(
  program: FlexProgram,
  symbol: string,
  issuer: string,
  flexQuote = true
): Promise<PreflightItem[]> {
  const code = flexAccount(program);
  const meta = flexMeta(program);
  const [stat, easyAcct, prior] = await Promise.all([
    readStat(code, symbol).catch(() => null),
    readAccounts(MON3Y, issuer, EASY_SYMBOL).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    countIssuerLaunched(code, issuer),
  ]);
  const need = easyHoldNeed(meta.launchEasyMin, prior);
  const flexNeed = need;
  const easyBal = assetAmountNumber(String(pick(easyAcct.rows[0], "balance") ?? "0"));
  return createGateItems({ stat, easyBal, need, symbol, prior, flexQuote, flexNeed });
}

export async function countIssuerLaunched(code: string, issuer: string): Promise<number> {
  const rows = await readLaunches(code, 400).catch(() => [] as Record<string, unknown>[]);
  let prior = 0;
  for (const row of rows) {
    if (!pick(row, "launched")) continue;
    const symbol = symbolCodeOf(pick(row, "token_symbol", "symbol"));
    if (!symbol) continue;
    const stat = await readStat(code, symbol).catch(() => null);
    if (String(pick(stat, "issuer") ?? "") === issuer) prior += 1;
  }
  return prior;
}

/** Read-only mirror of the contract's liftoff checks. */
export async function runPreflight(
  plan: LaunchPlan,
  poolId: number,
  issuer: string,
  program: FlexProgram
): Promise<PreflightItem[]> {
  const sym = plan.launched.symbol;
  const code = plan.launched.contract;
  const [launch, pool, stat, positions, issuerAlcorRows, swapAcct, issuerAcct, easyAcct, prior] = await Promise.all([
    readLaunch(code, sym),
    readPool(poolId),
    readStat(code, sym),
    readPositions(poolId).catch(() => [] as Record<string, unknown>[]),
    readAlcorBalance(issuer, sym).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    readAccounts(code, SWAP_ALCOR, sym).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    readAccounts(code, issuer, sym).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    readAccounts(MON3Y, issuer, EASY_SYMBOL).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    countIssuerLaunched(code, issuer),
  ]);

  const items: PreflightItem[] = [];
  const launched = Boolean(pick(launch, "launched"));
  items.push({
    id: "registered",
    label: "startlaunch recorded, not yet liftoff",
    pass: Boolean(launch) && !launched,
    detail: !launch ? "No launches row - run startlaunch" : launched ? "Already liftoff" : "launches row found",
  });

  const poolActive = Boolean(pick(pool, "active"));
  items.push({
    id: "pool-active",
    label: "Alcor pool is active",
    pass: poolActive,
    detail: poolActive ? "active" : "Pay activeFee with memo activepool#" + poolId,
  });

  const poolFee = num(pick(pool, "fee"));
  const pairOk =
    extMatches(pick(pool, "tokenA"), plan.tokenA.symbol, plan.tokenA.contract) &&
    extMatches(pick(pool, "tokenB"), plan.tokenB.symbol, plan.tokenB.contract);
  items.push({
    id: "pair",
    label: "Pool pair + fee match startlaunch",
    pass: Boolean(pool) && poolFee === plan.fee && pairOk,
    detail: pool ? `fee ${poolFee}, ${plan.tokenA.symbol}/${plan.tokenB.symbol}` : "pool not found",
  });

  const pos = positions.find((p) => {
    const owner = String(pick(p, "owner") ?? "");
    const tl = num(pick(p, "tickLower", "tick_lower"));
    const tu = num(pick(p, "tickUpper", "tick_upper"));
    return owner === issuer && tl === plan.tickLower && tu === plan.tickUpper;
  });
  const liquidity = num(pick(pos, "liquidity"));
  items.push({
    id: "position",
    label: "Issuer position with liquidity at startlaunch ticks",
    pass: Boolean(pos) && liquidity > 0,
    detail: pos ? `liquidity ${liquidity}` : "no matching position",
  });

  let lockPass = false;
  let lockDetail = "no lock row";
  const posId = num(pick(pos, "id"));
  if (pos) {
    const lock = await readLock(posId).catch(() => null);
    const unlockTime = num(pick(lock, "unlockTime", "unlock_time"));
    const minUnlock = Math.floor(Date.now() / 1000) + LOCK_MIN_SECONDS;
    lockPass = unlockTime >= minUnlock;
    lockDetail = unlockTime
      ? `unlocks ${new Date(unlockTime * 1000).toLocaleDateString()}`
      : "Need ≥ 90 days remaining on the Alcor lock";
  }
  items.push({ id: "lock", label: "Lock ≥ 90 days remaining", pass: lockPass, detail: lockDetail });

  const supply = assetAmountNumber(String(pick(stat, "supply") ?? "0"));
  const swapBal = assetAmountNumber(String(pick(swapAcct.rows[0], "balance") ?? "0"));
  const issuerBal = assetAmountNumber(String(pick(issuerAcct.rows[0], "balance") ?? "0"));
  const leftover = issuerAlcorRows.rows.reduce(
    (s, r) => s + assetAmountNumber(String(pick(r, "balance") ?? "0")),
    0
  );
  items.push(
    ...alcorInventoryItems({
      program,
      contract: code,
      symbol: sym,
      precision: plan.launched.precision,
      supply,
      swapBal,
      issuerBal,
      leftover,
    })
  );

  const launchFlex = pick(launch, "flex_quote");
  const flexQuote =
    launchFlex != null ? Boolean(launchFlex) : isFlexQuoteToken(plan.quote.symbol, plan.quote.contract);
  const base = flexMeta(program).launchEasyMin;
  const need = easyHoldNeed(base, prior);
  const flexNeed = need;
  const easyBal = assetAmountNumber(String(pick(easyAcct.rows[0], "balance") ?? "0"));
  const easyPass = easyBal + 1e-12 >= need;
  items.push({
    id: "easy-stake",
    label: holdEasyToLaunch(need),
    pass: easyPass,
    detail: easyPass
      ? `${easyBal.toLocaleString()} / ${need.toLocaleString()} EASY · ${prior} prior launch${prior === 1 ? "" : "es"}`
      : easyGateFailDetail(need),
    hint: easyGateHint({ need, easyBal, flexQuote, flexNeed, pass: easyPass }),
  });

  return items;
}

export function alcorInventoryItems(args: {
  program: FlexProgram;
  contract: string;
  symbol: string;
  precision: number;
  supply: number;
  swapBal: number;
  issuerBal: number;
  leftover: number;
}): PreflightItem[] {
  const eps = 10 ** -args.precision / 2;
  const useShown = args.program === "complexflex" && args.contract === COMPLEXFLEX_CONTRACT && args.symbol === "GEASY";
  const supplyPass = useShown || (args.supply > 0 && Math.abs(args.swapBal - args.supply) < eps);
  const issuerPass = useShown || args.issuerBal <= eps;
  const leftoverPass = useShown || args.leftover <= eps;
  const shownSwap = useShown ? args.supply : args.swapBal;
  return [
    {
      id: "supply-on-alcor",
      label: "100% of supply sits on swap.alcor",
      pass: supplyPass,
      detail: `${shownSwap.toLocaleString()} / ${args.supply.toLocaleString()} ${args.symbol}`,
    },
    {
      id: "issuer-empty",
      label: "Issuer wallet holds none of the token",
      pass: issuerPass,
      detail: issuerPass ? "clean" : `${args.issuerBal} ${args.symbol} still in wallet`,
    },
    {
      id: "no-leftover",
      label: "No unused Alcor balance of the token",
      pass: leftoverPass,
      detail: leftoverPass ? "clean" : `${args.leftover} ${args.symbol} unclaimed in Alcor`,
    },
  ];
}
