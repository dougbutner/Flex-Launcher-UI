import { QUOTE_PRESETS, XTOKENS } from "@/config/launch";
import type { LaunchDraft } from "@/hooks/useLaunchDraft";
import { validSymbol } from "@/services/assets";
import { validImageUrl } from "@/services/tokenLogo";
import type { ExtToken } from "@/services/eosioName";
import { planLaunch, type LaunchPlan } from "@/services/launchMath";

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

export function tokenStepValid(draft: LaunchDraft): string | null {
  if (!draft.name.trim()) return "Give the token a display name.";
  if (!validSymbol(draft.symbol)) return "Ticker must be 1–7 uppercase letters (A–Z).";
  if (!(Number(draft.maxSupply) > 0)) return "Max supply must be greater than zero.";
  if (draft.precision < 0 || draft.precision > 8) return "Precision must be 0–8.";
  if (draft.pinFailed && !validImageUrl(draft.imageUrl)) return "Pinata failed — paste a public image URL.";
  return null;
}

export function quoteStepValid(draft: LaunchDraft): string | null {
  if (draft.quoteId !== "xtoken") return null;
  if (!validSymbol(draft.xtokenSymbol.trim().toUpperCase())) return "Enter a valid xtoken symbol.";
  if (!/^\d+$/.test(draft.proofPoolId.trim())) return "Paste the Alcor proof pool id.";
  return null;
}

export function rangeStepValid(draft: LaunchDraft): string | null {
  const lo = Number(draft.priceLower);
  const hi = Number(draft.priceUpper);
  if (!(lo > 0) || !(hi > 0)) return "Both prices must be greater than zero.";
  if (lo === hi) return "Lower and upper prices must differ.";
  if (draft.lockDays < 90) return "Lock must be at least 90 days.";
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
  if (n >= 1_000_000) return n.toExponential(2);
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(3);
}
