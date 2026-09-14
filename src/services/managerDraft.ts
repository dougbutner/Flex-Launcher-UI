import { flexAccount, QUOTE_PRESETS, type FlexProgram } from "@/config/launch";
import { emptyDraft, type LaunchDraft } from "@/hooks/useLaunchDraft";
import { emptyManagerToken, type ManagerToken } from "@/services/managerStore";
import { validImageUrl } from "@/services/tokenLogo";

const QUOTE_IDS = new Set(QUOTE_PRESETS.map((q) => q.id));

export function managerFromDraft(issuer: string, draft: LaunchDraft, extra: Partial<ManagerToken> = {}): ManagerToken {
  const now = Date.now();
  return {
    ...emptyManagerToken(),
    ...extra,
    issuer: issuer.trim().toLowerCase(),
    contract: flexAccount(draft.program),
    symbol: draft.symbol.trim().toUpperCase(),
    precision: draft.precision,
    program: draft.program,
    name: draft.name.trim(),
    description: draft.description.trim(),
    website: draft.website.trim(),
    twitter: draft.twitter.trim(),
    telegram: draft.telegram.trim(),
    farcaster: draft.farcaster.trim(),
    imageUrl: validImageUrl(draft.imageUrl) ? draft.imageUrl.trim() : "",
    maxSupply: draft.maxSupply.trim(),
    quoteId: draft.quoteId,
    xtokenSymbol: draft.xtokenSymbol,
    xtokenPrecision: draft.xtokenPrecision,
    proofPoolId: draft.proofPoolId,
    swapUnderlyingDefault: draft.swapUnderlyingDefault,
    fee: draft.fee,
    reflectionRate: draft.reflectionRate,
    burnRate: draft.burnRate,
    projectRate: draft.projectRate,
    projectAccount: draft.projectAccount,
    angelNumbersBps: draft.angelNumbersBps,
    jackpotBps: draft.jackpotBps,
    rainMinHold: draft.rainMinHold,
    rainMinPool: draft.rainMinPool,
    priceLower: draft.priceLower,
    priceUpper: draft.priceUpper,
    lockDays: draft.lockDays,
    poolId: draft.poolId,
    createTx: draft.createTx,
    feesTx: draft.feesTx,
    mintTx: draft.mintTx,
    startTx: draft.startTx,
    poolTx: draft.poolTx,
    activateTx: draft.activateTx,
    depositTx: draft.depositTx,
    rangeTx: draft.rangeTx,
    lockTx: draft.lockTx,
    liftoffTx: draft.liftoffTx,
    addpoolTx: draft.addpoolTx,
    createdAt: extra.createdAt || now,
    updatedAt: now,
  };
}

export function draftFromManager(row: ManagerToken): LaunchDraft {
  const base = emptyDraft();
  const quoteId = QUOTE_IDS.has(row.quoteId as LaunchDraft["quoteId"])
    ? (row.quoteId as LaunchDraft["quoteId"])
    : base.quoteId;
  return {
    ...base,
    program: row.program as FlexProgram,
    name: row.name || row.symbol,
    symbol: row.symbol,
    precision: row.precision,
    maxSupply: row.maxSupply || base.maxSupply,
    imageUrl: row.imageUrl,
    description: row.description,
    website: row.website,
    twitter: row.twitter,
    telegram: row.telegram,
    farcaster: row.farcaster,
    quoteId,
    xtokenSymbol: row.xtokenSymbol || "XUSDC",
    xtokenPrecision: row.xtokenPrecision || 6,
    proofPoolId: row.proofPoolId || "0",
    swapUnderlyingDefault: row.swapUnderlyingDefault,
    fee: row.fee,
    reflectionRate: row.reflectionRate ?? base.reflectionRate,
    burnRate: row.burnRate ?? base.burnRate,
    projectRate: row.projectRate ?? base.projectRate,
    projectAccount: row.projectAccount ?? "",
    angelNumbersBps: row.angelNumbersBps ?? 0,
    jackpotBps: row.jackpotBps ?? 0,
    rainMinHold: row.rainMinHold ?? 0,
    rainMinPool: row.rainMinPool ?? 0,
    priceLower: row.priceLower || base.priceLower,
    priceUpper: row.priceUpper || base.priceUpper,
    lockDays: row.lockDays,
    createTx: row.createTx === "onchain" ? "onchain" : row.createTx,
    feesTx: row.feesTx,
    mintTx: row.mintTx,
    startTx: row.startTx,
    poolId: row.poolId,
    poolTx: row.poolTx,
    activateTx: row.activateTx,
    depositTx: row.depositTx,
    rangeTx: row.rangeTx,
    lockTx: row.lockTx,
    liftoffTx: row.liftoffTx,
    addpoolTx: row.addpoolTx,
  };
}
