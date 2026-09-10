import { LOCK_MIN_DAYS, QUOTE_PRESETS, type FeeTier, type FlexProgram, type RangeWidthId } from "@/config/launch";
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

const KEY = "flex-launch-draft-v5";
export const DRAFT_STORAGE_KEY = KEY;
export const MANAGER_RESUME_KEY = "flex-manager-resume";

export function writeLaunchDraft(draft: LaunchDraft) {
  localStorage.setItem(KEY, JSON.stringify(draft));
}

const easy = QUOTE_PRESETS.find((q) => q.id === "easy") ?? QUOTE_PRESETS[0];

export const emptyDraft = (): LaunchDraft => ({
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
  mintTx: "",
  startTx: "",
  poolId: null,
  poolTx: "",
  activateTx: "",
  depositTx: "",
  rangeTx: "",
  lockTx: "",
  liftoffTx: "",
});

function load(): LaunchDraft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDraft();
    const saved = { ...emptyDraft(), ...JSON.parse(raw) } as LaunchDraft;
    return saved;
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
