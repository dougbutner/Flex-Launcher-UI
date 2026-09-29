import { randomPlaceholderToken } from "@/components/launch/randomTokenName";
import { LOCK_SLIDER_MAX_DAYS, LOCK_UI_MIN_DAYS, QUOTE_PRESETS, type FeeTier, type FlexProgram, type RangeWidthId } from "@/config/launch";
import { defaultTaxDraft } from "@/services/taxRates";
import { useCallback, useEffect, useState } from "react";

export type LaunchDraft = {
  program: FlexProgram;
  name: string;
  symbol: string;
  /** True after a mythic seed or any saved name/ticker. Stops a later load from refilling blanks. */
  identitySeeded: boolean;
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
  /** Frontend makeitrain min_hold / min_pool. Not on-chain. */
  rainMinHold: number;
  rainMinPool: number;
  quoteId: (typeof QUOTE_PRESETS)[number]["id"];
  xtokenSymbol: string;
  xtokenPrecision: number;
  proofPoolId: string;
  /** When true, unpaid holders receive the launch quote instead of the new token. */
  swapUnderlyingDefault: boolean;
  fee: FeeTier;
  priceLower: string;
  priceUpper: string;
  /** Width preset last applied; cleared when prices are typed by hand. */
  rangeWidthId: RangeWidthId | null;
  lockDays: number;
  /** Slider end in days. Grows when the typed lock is longer than the default 730. */
  lockDaysMax: number;
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
  addpoolTx: string;
  /** Hold launched false after liftoff until golive. */
  presaleEnabled: boolean;
  /** 0 freeze, 1 insider window. */
  presaleMode: number;
  /** datetime-local strings → unix on sign. */
  presaleInsiderTime: string;
  presaleLaunchTime: string;
  presaleInsiderBps: number;
  presaleLockedInsiderBps: number;
  presaleCollection: string;
  presaleSchema: string;
  presaleNftMin: number;
  presaleMinTokenQty: string;
  presaleMinTokenContract: string;
  presaleLpMin: number;
  presaleLockedLpMin: number;
  /** Seconds remaining on proven Alcor lock for higher cap. */
  presaleLockSecs: number;
  /** eosio.proton usersinfo.verified. */
  presaleNeedKyc: boolean;
  /** true = every set gate; false = any one gate. */
  presaleGatesAll: boolean;
  /** Issuer addinsiders comma/space list, signed with setpresale after lock. */
  presaleInviteList: string;
  presaleTx: string;
};

const KEY = "flex-launch-draft-v8";
export const DRAFT_STORAGE_KEY = KEY;
export const MANAGER_RESUME_KEY = "flex-manager-resume";

export function writeLaunchDraft(draft: LaunchDraft) {
  localStorage.setItem(KEY, JSON.stringify(draft));
}

const easy = QUOTE_PRESETS.find((q) => q.id === "easy") ?? QUOTE_PRESETS[0];

/** Fill name + ticker once when both are still blank. Never replaces a typed field. */
function seedIfBlank(d: LaunchDraft): LaunchDraft {
  if (d.identitySeeded) return d;
  if (d.name.trim() || d.symbol.trim()) return { ...d, identitySeeded: true };
  const { name, symbol } = randomPlaceholderToken();
  return { ...d, name, symbol, identitySeeded: true };
}

export const emptyDraft = (): LaunchDraft => {
  const tax = defaultTaxDraft("flexforex");
  return {
    program: "flexforex",
    name: "",
    symbol: "",
    identitySeeded: false,
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
    rainMinHold: 0,
    rainMinPool: 0,
    quoteId: "easy",
    xtokenSymbol: "XUSDC",
    xtokenPrecision: 6,
    proofPoolId: "0",
    swapUnderlyingDefault: false,
    fee: 3000,
    priceLower: easy.priceLower,
    priceUpper: easy.priceUpper,
    rangeWidthId: null,
    lockDays: LOCK_UI_MIN_DAYS,
    lockDaysMax: LOCK_SLIDER_MAX_DAYS,
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
    addpoolTx: "",
    presaleEnabled: false,
    presaleMode: 1,
    presaleInsiderTime: "",
    presaleLaunchTime: "",
    presaleInsiderBps: 100,
    presaleLockedInsiderBps: 0,
    presaleCollection: "",
    presaleSchema: "",
    presaleNftMin: 0,
    presaleMinTokenQty: "",
    presaleMinTokenContract: "",
    presaleLpMin: 0,
    presaleLockedLpMin: 0,
    presaleLockSecs: 0,
    presaleNeedKyc: false,
    presaleGatesAll: false,
    presaleInviteList: "",
    presaleTx: "",
  };
};

function load(): LaunchDraft {
  try {
    const v8 = localStorage.getItem(KEY);
    const legacy =
      localStorage.getItem("flex-launch-draft-v7") ??
      localStorage.getItem("flex-launch-draft-v6") ??
      localStorage.getItem("flex-launch-draft-v5");
    const raw = v8 ?? legacy;
    if (!raw) return seedIfBlank(emptyDraft());
    const parsed = JSON.parse(raw) as Partial<LaunchDraft>;
    const program = (parsed.program as FlexProgram) || "flexforex";
    const tax = defaultTaxDraft(program);
    const fromLegacy = !v8 && Boolean(legacy);
    return seedIfBlank({
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
      swapUnderlyingDefault: fromLegacy && !parsed.startTx ? false : Boolean(parsed.swapUnderlyingDefault),
      lockDays: Math.max(LOCK_UI_MIN_DAYS, Math.floor(Number(parsed.lockDays) || LOCK_UI_MIN_DAYS)),
    });
  } catch {
    return seedIfBlank(emptyDraft());
  }
}

export function useLaunchDraft() {
  const [draft, setDraft] = useState<LaunchDraft>(() => {
    try {
      if (typeof localStorage === "undefined") return emptyDraft();
      return load();
    } catch {
      return emptyDraft();
    }
  });
  const [hydrated, setHydrated] = useState(() => typeof localStorage !== "undefined");

  useEffect(() => {
    if (hydrated) return;
    setDraft(load());
    setHydrated(true);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  const patch = useCallback((partial: Partial<LaunchDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    const next = seedIfBlank(emptyDraft());
    setDraft(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  return { draft, patch, reset, setDraft };
}
