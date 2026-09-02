import { LOCK_MIN_DAYS, QUOTE_PRESETS, type FeeTier } from "@/config/launch";
import { useCallback, useEffect, useState } from "react";

export type LaunchDraft = {
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
  ramTx: string;
  forgeTx: string;
  mintTx: string;
  regTx: string;
  poolId: number | null;
  poolTx: string;
  activateTx: string;
  depositTx: string;
  rangeTx: string;
  lockTx: string;
  stampTx: string;
};

const KEY = "flex-launch-draft";

const easy = QUOTE_PRESETS[0];

export const emptyDraft = (): LaunchDraft => ({
  name: "",
  symbol: "",
  precision: 4,
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
  proofPoolId: "",
  fee: 3000,
  priceLower: easy.priceLower,
  priceUpper: easy.priceUpper,
  lockDays: LOCK_MIN_DAYS,
  ramTx: "",
  forgeTx: "",
  mintTx: "",
  regTx: "",
  poolId: null,
  poolTx: "",
  activateTx: "",
  depositTx: "",
  rangeTx: "",
  lockTx: "",
  stampTx: "",
});

function load(): LaunchDraft {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDraft();
    return { ...emptyDraft(), ...JSON.parse(raw) };
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
