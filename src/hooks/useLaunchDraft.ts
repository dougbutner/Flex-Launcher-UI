import { LOCK_MIN_DAYS, QUOTE_PRESETS, type FeeTier, type FlexProgram } from "@/config/launch";
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
  fee: FeeTier;
  priceLower: string;
  priceUpper: string;
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

const KEY = "flex-launch-draft-v3";

const xtoken = QUOTE_PRESETS.find((q) => q.id === "xtoken") ?? QUOTE_PRESETS[0];

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
  quoteId: "xtoken",
  xtokenSymbol: "FOOBAR",
  xtokenPrecision: 6,
  proofPoolId: "0",
  fee: 3000,
  priceLower: xtoken.priceLower,
  priceUpper: xtoken.priceUpper,
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
    if (!saved.createTx && saved.precision === 4) saved.precision = 6;
    if (!saved.createTx && saved.quoteId === "easy") {
      saved.quoteId = "xtoken";
      saved.xtokenSymbol = saved.xtokenSymbol || "FOOBAR";
      saved.proofPoolId = saved.proofPoolId || "0";
    }
    return saved;
  } catch {
    return emptyDraft();
  }
}

export function useLaunchDraft() {
  const [draft, setDraft] = useState<LaunchDraft>(emptyDraft);

  useEffect(() => {
    setDraft(load());
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(draft));
  }, [draft]);

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
