import { formatPriceInput } from "@/components/launch/draftPlan";
import {
  EOSIO_TOKEN,
  FEE_TIERS,
  FLEXFOREX_CONTRACT,
  LOCK_SLIDER_MAX_DAYS,
  MON3Y,
  WRAP_ALCOR,
  XTOKENS,
  type FeeTier,
} from "@/config/launch";
import { emptyDraft, type LaunchDraft } from "@/hooks/useLaunchDraft";
import { sortPair, type ExtToken } from "@/services/eosioName";
import { rawPriceFromTick } from "@/services/tickMath";

/** Issuer for every HOLO release. Nav and the page are limited to this account. */
export const HOLO_ISSUER = "holo.fl3x";

/** Dollar backing is USDC@wrap.alcor. */
export type HoloToken = {
  symbol: string;
  quoteSymbol: string;
  quoteContract: string;
  quotePrecision: number;
  quoteId: LaunchDraft["quoteId"];
  logo: string;
};

const xt = (quoteSymbol: string, quotePrecision: number, logo = quoteSymbol): Pick<
  HoloToken,
  "quoteSymbol" | "quoteContract" | "quotePrecision" | "quoteId" | "logo"
> => ({
  quoteSymbol,
  quoteContract: XTOKENS,
  quotePrecision,
  quoteId: "xtoken",
  logo: `/tokens/holoxtokens/${logo}.png`,
});

/** Wednesday order starting 2026-10-28. */
export const HOLO_TOKENS: HoloToken[] = [
  { symbol: "HOLOXPR", quoteSymbol: "XPR", quoteContract: EOSIO_TOKEN, quotePrecision: 4, quoteId: "xpr", logo: "/tokens/eosio.token/XPR.png" },
  {
    symbol: "HOLOUSD",
    quoteSymbol: "USDC",
    quoteContract: WRAP_ALCOR,
    quotePrecision: 6,
    quoteId: "wrap",
    logo: "/tokens/holoxtokens/XUSDC.png",
  },
  { symbol: "HOLOBTC", ...xt("XBTC", 8) },
  { symbol: "HOLOETH", ...xt("XETH", 8) },
  { symbol: "HOLOXRP", ...xt("XXRP", 6) },
  { symbol: "HEASY", quoteSymbol: "EASY", quoteContract: MON3Y, quotePrecision: 6, quoteId: "easy", logo: "/tokens/easy.png" },
  { symbol: "HOLOSOL", ...xt("XSOL", 6) },
  { symbol: "HGRAMS", quoteSymbol: "GRAMS", quoteContract: "gold.mon3y", quotePrecision: 6, quoteId: "grams", logo: "/tokens/grams.png" },
  { symbol: "HDOGE", ...xt("XDOGE", 6) },
  { symbol: "HOLOXLM", ...xt("XXLM", 6) },
  { symbol: "HOLOLTC", ...xt("XLTC", 8) },
  { symbol: "HHBAR", ...xt("XHBAR", 6) },
  { symbol: "HOLOXMT", ...xt("XMT", 8) },
  { symbol: "HOLOXDC", ...xt("XDC", 4) },
  { symbol: "HPAXG", ...xt("XPAXG", 8) },
];

export type HoloFees = {
  /** Regular reflection, bps of the transfer. Angel and jackpot are extra slices of the same reflection fee. */
  holdersBps: number;
  angelBps: number;
  jackpotBps: number;
  burnBps: number;
  projectBps: number;
  poolFee: FeeTier;
  insiderBps: number;
  lockedInsiderBps: number;
  lockDays: number;
  proofLockDays: number;
};

export const HOLO_FEES: HoloFees = {
  holdersBps: 150,
  angelBps: 20,
  jackpotBps: 20,
  burnBps: 0,
  projectBps: 10,
  poolFee: 10000,
  insiderBps: 10,
  lockedInsiderBps: 100,
  lockDays: 1080,
  proofLockDays: 87,
};

export const HOLO_TX_KEYS = [
  "createTx",
  "feesTx",
  "mintTx",
  "startTx",
  "poolId",
  "poolTx",
  "activateTx",
  "depositTx",
  "rangeTx",
  "lockTx",
  "liftoffTx",
  "addpoolTx",
  "presaleTx",
] as const;

export type HoloTxKey = (typeof HOLO_TX_KEYS)[number];

export function holoNeedsProof(token: HoloToken): boolean {
  return token.quoteId !== "easy" && token.quoteId !== "grams";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Insider open, then public sale 30 days later. Index 0 is Wednesday 2026-10-28. */
export function holoSchedule(index: number): { insider: string; launch: string } {
  const insider = new Date(2026, 9, 28, 0, 0, 0);
  insider.setDate(insider.getDate() + index * 7);
  const launch = new Date(insider);
  launch.setDate(launch.getDate() + 30);
  return { insider: stamp(insider), launch: stamp(launch) };
}

export function holoReflectionSplit(fees: Pick<HoloFees, "holdersBps" | "angelBps" | "jackpotBps">): {
  reflectionRate: number;
  angelNumbersBps: number;
  jackpotBps: number;
} {
  const holders = Math.max(0, Math.floor(fees.holdersBps));
  const angel = Math.max(0, Math.floor(fees.angelBps));
  const jackpot = Math.max(0, Math.floor(fees.jackpotBps));
  const reflectionRate = holders + angel + jackpot;
  const share = (part: number) => (reflectionRate > 0 && part > 0 ? Math.round((part * 10000) / reflectionRate) : 0);
  let angelNumbersBps = Math.min(10000, share(angel));
  let jackpotBps = Math.min(10000, share(jackpot));
  const over = angelNumbersBps + jackpotBps - 10000;
  if (over > 0) {
    if (angelNumbersBps >= jackpotBps) angelNumbersBps -= over;
    else jackpotBps -= over;
  }
  return { reflectionRate, angelNumbersBps, jackpotBps };
}

export type HoloBand = { priceLower: string; priceUpper: string; fee: FeeTier };

/** Quote-per-token at the signed ticks, so a later price update cannot move the range. */
export function holoBandFromTicks(input: {
  symbol: string;
  quote: ExtToken;
  fee: number;
  tickLower: number;
  tickUpper: number;
}): HoloBand | null {
  if (!Number.isFinite(input.tickLower) || !Number.isFinite(input.tickUpper) || input.tickLower === input.tickUpper) return null;
  const launched: ExtToken = { symbol: input.symbol, contract: FLEXFOREX_CONTRACT, precision: 6 };
  const [tokenA, tokenB] = sortPair(launched, input.quote);
  const launchedIsA = tokenA.symbol === launched.symbol && tokenA.contract === launched.contract;
  const per = (tick: number) => {
    const humanAB = rawPriceFromTick(tick) * 10 ** (tokenA.precision - tokenB.precision);
    const quotePer = launchedIsA ? humanAB : humanAB > 0 ? 1 / humanAB : 0;
    return quotePer > 0 ? formatPriceInput(quotePer) : "";
  };
  const priceLower = per(input.tickLower);
  const priceUpper = per(input.tickUpper);
  if (!priceLower || !priceUpper) return null;
  return { priceLower, priceUpper, fee: holoFeeTier(input.fee) };
}

/** Quote units per token for a $1 start and a $10,000 top. */
export function holoPriceBand(quoteUsd: number): { priceLower: string; priceUpper: string } {
  if (!(quoteUsd > 0)) return { priceLower: "", priceUpper: "" };
  return {
    priceLower: formatPriceInput(1 / quoteUsd),
    priceUpper: formatPriceInput(10000 / quoteUsd),
  };
}

export function holoFeeTier(n: number): FeeTier {
  return FEE_TIERS.some((t) => t.fee === n) ? (n as FeeTier) : 10000;
}

export function holoDraft(input: {
  token: HoloToken;
  fees: HoloFees;
  insider: string;
  launch: string;
  quoteUsd: number;
  proofPoolId: string;
  quotePrecision?: number;
  txs?: Partial<LaunchDraft>;
  /** Signed range. Later edits and price updates leave this token alone. */
  band?: HoloBand | null;
  logoUrl: string;
}): LaunchDraft {
  const split = holoReflectionSplit(input.fees);
  const prices = holoPriceBand(input.quoteUsd);
  const draft = emptyDraft();
  draft.program = "flexforex";
  draft.name = input.token.symbol;
  draft.symbol = input.token.symbol;
  draft.identitySeeded = true;
  draft.precision = 6;
  draft.maxSupply = "10000";
  draft.imageUrl = input.logoUrl;
  draft.reflectionRate = split.reflectionRate;
  draft.burnRate = input.fees.burnBps;
  draft.projectRate = input.fees.projectBps;
  draft.projectAccount = HOLO_ISSUER;
  draft.angelNumbersBps = split.angelNumbersBps;
  draft.jackpotBps = split.jackpotBps;
  draft.quoteId = input.token.quoteId;
  draft.xtokenSymbol = input.token.quoteSymbol;
  draft.xtokenPrecision = input.quotePrecision ?? input.token.quotePrecision;
  draft.proofPoolId = holoNeedsProof(input.token) ? input.proofPoolId || "0" : "0";
  draft.swapUnderlyingDefault = true;
  draft.fee = input.fees.poolFee;
  draft.priceLower = input.band?.priceLower || prices.priceLower;
  draft.priceUpper = input.band?.priceUpper || prices.priceUpper;
  if (input.band) draft.fee = input.band.fee;
  draft.rangeWidthId = null;
  draft.lockDays = input.fees.lockDays;
  draft.lockDaysMax = Math.max(LOCK_SLIDER_MAX_DAYS, input.fees.lockDays);
  draft.presaleEnabled = true;
  draft.presaleMode = 1;
  draft.presaleInsiderTime = input.insider;
  draft.presaleLaunchTime = input.launch;
  draft.presaleInsiderBps = input.fees.insiderBps;
  draft.presaleLockedInsiderBps = input.fees.lockedInsiderBps;
  draft.presaleInviteList = "";
  draft.presaleLpMin = 0;
  draft.presaleLockedLpMin = 0;
  draft.presaleLockSecs = Math.max(0, input.fees.proofLockDays) * 86400;
  draft.presaleNeedKyc = false;
  draft.presaleGatesAll = false;
  draft.presaleCollection = "";
  draft.presaleSchema = "";
  draft.presaleNftMin = 0;
  draft.presaleMinTokenQty = "";
  draft.presaleMinTokenContract = "";
  const txs = input.txs;
  if (txs) {
    for (const key of HOLO_TX_KEYS) {
      const value = txs[key];
      if (key === "poolId") {
        if (typeof value === "number" && value > 0) draft.poolId = value;
        continue;
      }
      if (typeof value === "string" && value) draft[key] = value;
    }
  }
  return draft;
}
