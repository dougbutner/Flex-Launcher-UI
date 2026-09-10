import { LOCK_MIN_DAYS, QUOTE_PRESETS, type FeeTier, type FlexProgram, type RangeWidthId } from "@/config/launch";
import { defaultTaxDraft } from "@/services/taxRates";
import { useCallback, useEffect, useState } from "react";

export type LaunchDraft = {
  program: FlexProgram;
  name: string;
  symbol: string;
  precision: number;
  maxSupply: string;
  imageDataUrl: string;
  imageCid: string;
  imageUrl: string;
  pinFailed: boolean;
  logoTx: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  farcaster: string;
  /** Transfer tax bps for setfees after create. */
  reflectionRate: number;
  burnRate: number;
  projectRate: number;
  /** Blank = issuer at create. */
  projectAccount: string;
  /** for3x: share of reflection_rate cut into angel / jackpot pots. */
  angelNumbersBps: number;
  jackpotBps: number;
  quoteId: (typeof QUOTE_PRESETS)[number]["id"];
  xtokenSymbol: string;
  xtokenPrecision: number;
  proofPoolId: string;
  /** startlaunch: holders with flex_reward_pool_id==0 get swapped into the launch quote. */
  swapUnderlyingDefault: boolean;
  fee: FeeTier;
  priceLower: string;
  priceUpper: string;
  /** Width preset last applied; cleared when prices are typed by hand. */
  rangeWidthId: RangeWidthId | null;
  lockDays: number;
  createTx: string;
  feesTx: string;
  mintTx: string;
  startTx: string;
  poolId: number | null;
  poolTx: string;
  activateTx: string;
  depositTx: string;
  rangeTx: string;
  lockTx: string;
  liftoffTx: string;
};

const KEY = "flex-launch-draft-v7";
export const DRAFT_STORAGE_KEY = KEY;
export const MANAGER_RESUME_KEY = "flex-manager-resume";

export function writeLaunchDraft(draft: LaunchDraft) {
  localStorage.setItem(KEY, JSON.stringify(draft));
}

const easy = QUOTE_PRESETS.find((q) => q.id === "easy") ?? QUOTE_PRESETS[0];

export const emptyDraft = (): LaunchDraft => {
  const tax = defaultTaxDraft("flexforex");
  return {
    program: "flexforex",
    name: "",
    symbol: "",
    precision: 6,
    maxSupply: "1000000",
    imageDataUrl: "",
    imageCid: "",
    imageUrl: "",
    pinFailed: false,
    logoTx: "",
    description: "",
    website: "",
    twitter: "",
    telegram: "",
    farcaster: "",
    reflectionRate: tax.reflectionRate,
    burnRate: tax.burnRate,
    projectRate: tax.projectRate,
    projectAccount: tax.projectAccount,
    angelNumbersBps: tax.angelNumbersBps,
    jackpotBps: tax.jackpotBps,
    quoteId: "easy",
    xtokenSymbol: "XUSDC",
    xtokenPrecision: 6,
    proofPoolId: "0",
    swapUnderlyingDefault: true,
    fee: 3000,
    priceLower: easy.priceLower,
    priceUpper: easy.priceUpper,
    rangeWidthId: null,
    lockDays: LOCK_MIN_DAYS,
    createTx: "",
    feesTx: "",
    mintTx: "",
    startTx: "",
    poolId: null,
    poolTx: "",
    activateTx: "",
    depositTx: "",
    rangeTx: "",
    lockTx: "",
    liftoffTx: "",
  };
};

function load(): LaunchDraft {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem("flex-launch-draft-v6") ?? localStorage.getItem("flex-launch-draft-v5");
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<LaunchDraft>;
    const program = (parsed.program as FlexProgram) || "flexforex";
    const tax = defaultTaxDraft(program);
    return {
      ...emptyDraft(),
      ...tax,
      ...parsed,
      program,
      reflectionRate: parsed.reflectionRate ?? tax.reflectionRate,
      burnRate: parsed.burnRate ?? tax.burnRate,
      projectRate: parsed.projectRate ?? tax.projectRate,
      projectAccount: parsed.projectAccount ?? tax.projectAccount,
      angelNumbersBps: parsed.angelNumbersBps ?? tax.angelNumbersBps,
      jackpotBps: parsed.jackpotBps ?? tax.jackpotBps,
    };
  } catch {
    return emptyDraft();
  }
}

export function useLaunchDraft() {
  const [draft, setDraft] = useState<LaunchDraft>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDraft(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  const patch = useCallback((partial: Partial<LaunchDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    const next = emptyDraft();
    setDraft(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  return { draft, patch, reset, setDraft };
}
