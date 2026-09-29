import {
  flexAccount,
  geasyQuoteAllowed,
  quoteNeedsProof,
  QUOTE_PRESETS,
  RANGE_WIDTH_PRESETS,
  XTOKENS,
  type RangeWidthId,
} from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { validSymbol } from "@/services/assets";
import { formatNiceNumber } from "@/services/money";
import { TOKEN_PROTON_TNAME_MAX } from "@/services/tokenProton";
import { validImageUrl } from "@/services/tokenLogo";
import type { ExtToken } from "@/services/eosioName";
import { planLaunch, type LaunchPlan } from "@/services/launchMath";
import { defaultTaxDraft, taxCreateValid, type TaxDraft } from "@/services/taxRates";

export function taxFromDraft(draft: LaunchDraft): TaxDraft {
  const base = defaultTaxDraft(draft.program);
  return {
    reflectionRate: draft.reflectionRate ?? base.reflectionRate,
    burnRate: draft.burnRate ?? base.burnRate,
    projectRate: draft.projectRate ?? base.projectRate,
    projectAccount: draft.projectAccount ?? base.projectAccount,
    angelNumbersBps: draft.angelNumbersBps ?? 0,
    jackpotBps: draft.jackpotBps ?? 0,
  };
}

export function quoteFromDraft(draft: LaunchDraft): ExtToken {
  const preset = QUOTE_PRESETS.find((q) => q.id === draft.quoteId) ?? QUOTE_PRESETS[0];
  if (preset.id === "xtoken") {
    return {
      symbol: draft.xtokenSymbol.trim().toUpperCase(),
      contract: XTOKENS,
      precision: draft.xtokenPrecision,
    };
  }
  return { symbol: preset.symbol, contract: preset.contract, precision: preset.precision };
}

export function presetFromDraft(draft: LaunchDraft) {
  return QUOTE_PRESETS.find((q) => q.id === draft.quoteId) ?? QUOTE_PRESETS[0];
}

/** Decimal string safe for price inputs (digits + optional dot only). */
export function formatPriceInput(n: number): string {
  if (!(n > 0) || !Number.isFinite(n)) return "1";
  if (n >= 1) {
    if (Math.abs(n - Math.round(n)) < n * 1e-12)     return formatNiceNumber(Math.round(n), false);
    return formatNiceNumber(n, false);
  }
  return formatNiceNumber(n, false);
}

/** Start price from FDV in USD (or quote units when quoteUsd is 0). Does not touch max price. */
export function applyStartMarketCap(draft: LaunchDraft, usdCap: number, quoteUsd = 0): Pick<LaunchDraft, "priceLower"> {
  const supply = Number(draft.maxSupply);
  if (!(supply > 0) || !(usdCap > 0) || !Number.isFinite(supply)) return { priceLower: draft.priceLower };
  const denom = quoteUsd > 0 ? supply * quoteUsd : supply;
  if (!(denom > 0)) return { priceLower: draft.priceLower };
  return { priceLower: formatPriceInput(usdCap / denom) };
}

export function applyRangeWidth(draft: LaunchDraft, id: RangeWidthId): Pick<LaunchDraft, "priceLower" | "priceUpper" | "rangeWidthId"> {
  const width = RANGE_WIDTH_PRESETS.find((w) => w.id === id) ?? RANGE_WIDTH_PRESETS[0];
  const quotePreset = presetFromDraft(draft);
  const loNum = Number(draft.priceLower);
  const base = loNum > 0 ? loNum : Number(quotePreset.priceLower) || 1;
  const priceLower = formatPriceInput(base);

  if (width.kind === "mult" && width.mult != null) {
    return {
      priceLower,
      priceUpper: formatPriceInput(base * width.mult),
      rangeWidthId: id,
    };
  }

  const quote = quoteFromDraft(draft);
  const symbol = validSymbol(draft.symbol) ? draft.symbol : "AAAAAAA";
  const quoteSym = validSymbol(quote.symbol) ? quote.symbol : "EASY";
  const probe = planLaunch({
    symbol,
    precision: draft.precision,
    maxSupply: draft.maxSupply || "1",
    contract: flexAccount(draft.program),
    quote: { ...quote, symbol: quoteSym },
    fee: draft.fee,
    priceLower,
    priceUpper: `1${"0".repeat(48)}`,
  });
  const hi = Math.max(probe.quotePerTokenLower, probe.quotePerTokenUpper);
  return {
    priceLower,
    priceUpper: formatPriceInput(hi > base ? hi : base * 1e12),
    rangeWidthId: id,
  };
}

export function tokenStepValid(draft: LaunchDraft): string | null {
  if (!draft.name.trim()) return "Give the token a display name.";
  if (draft.name.trim().length > TOKEN_PROTON_TNAME_MAX) {
    return `Display name is at most ${TOKEN_PROTON_TNAME_MAX} characters.`;
  }
  if (!validSymbol(draft.symbol)) return "Ticker must be 1-7 uppercase letters (A-Z).";
  if (!(Number(draft.maxSupply) > 0)) return "Max supply must be greater than zero.";
  if (draft.precision < 0 || draft.precision > 8) return "Precision must be 0-8.";
  if (draft.pinFailed && !validImageUrl(draft.imageUrl)) return "Pinata failed - paste a public image URL.";
  return null;
}

export function taxStepValid(draft: LaunchDraft): string | null {
  return taxCreateValid(taxFromDraft(draft), draft.program);
}

export function quoteStepValid(draft: LaunchDraft): string | null {
  const preset = presetFromDraft(draft);
  if (preset.id === "geasy" && !geasyQuoteAllowed(draft.program)) return "Pick another quote.";
  if (preset.id === "xtoken") {
    if (!validSymbol(draft.xtokenSymbol.trim().toUpperCase())) return "Enter a valid xtoken symbol.";
  }
  if (quoteNeedsProof(preset)) {
    if (!/^\d+$/.test(draft.proofPoolId.trim())) return "Paste the Alcor proof pool id.";
    if (Number(draft.proofPoolId) <= 0) return "Proof pool id must be greater than zero.";
  }
  return null;
}

export function rangeStepValid(draft: LaunchDraft): string | null {
  const lo = Number(draft.priceLower);
  const hi = Number(draft.priceUpper);
  if (!(lo > 0) || !(hi > 0)) return "Both prices must be greater than zero.";
  if (lo === hi) return "Lower and upper prices must differ.";
  if (draft.lockDays < 91) return "Lock must be at least 91 days.";
  return null;
}

/** Null until every input needed for planLaunch is sane. */
export function planFromDraft(draft: LaunchDraft): LaunchPlan | null {
  if (tokenStepValid(draft) || rangeStepValid(draft)) return null;
  const quote = quoteFromDraft(draft);
  if (!validSymbol(quote.symbol)) return null;
  try {
    return planLaunch({
      symbol: draft.symbol,
      precision: draft.precision,
      maxSupply: draft.maxSupply,
      contract: flexAccount(draft.program),
      quote,
      fee: draft.fee,
      priceLower: draft.priceLower,
      priceUpper: draft.priceUpper,
    });
  } catch {
    return null;
  }
}

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  return formatNiceNumber(n);
}
