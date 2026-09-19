import { hasAngelChannels, type FlexProgram } from "@/config/launch";
import { validAccount } from "@/services/assets";

/** Transfer tax + for3x channel draft fields (bps). */
export type TaxDraft = {
  reflectionRate: number;
  burnRate: number;
  projectRate: number;
  projectAccount: string;
  angelNumbersBps: number;
  jackpotBps: number;
};

/** Suggested first setfees split. On-chain create writes 0/0/0. */
export function defaultTaxDraft(program: FlexProgram): TaxDraft {
  if (program === "easyflex") {
    return {
      reflectionRate: 100,
      burnRate: 100,
      projectRate: 0,
      projectAccount: "",
      angelNumbersBps: 0,
      jackpotBps: 0,
    };
  }
  return {
    reflectionRate: 100,
    burnRate: 0,
    projectRate: 100,
    projectAccount: "",
    angelNumbersBps: 0,
    jackpotBps: 0,
  };
}

export function hasProjectTax(program: FlexProgram): boolean {
  return program === "complexflex" || program === "flexforex";
}

export function taxSum(draft: Pick<TaxDraft, "reflectionRate" | "burnRate" | "projectRate">, program: FlexProgram): number {
  const project = hasProjectTax(program) ? draft.projectRate : 0;
  return draft.reflectionRate + draft.burnRate + project;
}

export function channelSum(draft: Pick<TaxDraft, "angelNumbersBps" | "jackpotBps">): number {
  return draft.angelNumbersBps + draft.jackpotBps;
}

/** Keep a percent typing string: digits, one dot, at most 2 decimal places. */
export function sanitizePercentInput(raw: string): string {
  const s = String(raw).replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot < 0) return s;
  const whole = s.slice(0, dot).replace(/\./g, "");
  const frac = s
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  if (!whole && !frac) return ".";
  return `${whole || "0"}.${frac}`;
}

/** Percent string for bps (100 bps = 1%). */
export function bpsToPercentInput(bps: number, emptyZero = false): string {
  if (!Number.isFinite(bps) || bps <= 0) return emptyZero ? "" : "0";
  const pct = bps / 100;
  if (Number.isInteger(pct)) return String(pct);
  return (Math.round(pct * 100) / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** Parse a percent field into bps. Empty / invalid → 0. */
export function percentInputToBps(raw: string): number {
  const cleaned = sanitizePercentInput(raw);
  if (!cleaned || cleaned === ".") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10000, Math.round(n * 100));
}

export function formatBpsPercent(bps: number): string {
  return `${bpsToPercentInput(bps)}%`;
}

function projectAccountErr(draft: TaxDraft, program: FlexProgram): string | null {
  if (!hasProjectTax(program) || !draft.projectAccount.trim()) return null;
  if (!validAccount(draft.projectAccount.trim().toLowerCase())) {
    return "Project account must be a valid XPR name (or leave blank for the issuer).";
  }
  return null;
}

function taxChannelValid(draft: TaxDraft, program: FlexProgram): string | null {
  if (hasAngelChannels(program) && channelSum(draft) > 10000) {
    return "Angel + jackpot cannot exceed 100% of the reflection slice.";
  }
  return null;
}

/** Bucket rules for setfees (no angel/jackpot). Null = ok. */
export function taxRateValid(draft: TaxDraft, program: FlexProgram, chain: TaxDraft | null = null): string | null {
  const newSum = taxSum(draft, program);
  if (newSum > 10000) return "⟁ Total fees cannot exceed 100%";
  if (chain && taxSum(chain, program) > 0) {
    if (newSum > taxSum(chain, program)) return "⟁ Total tax cannot increase";
    if (draft.reflectionRate < chain.reflectionRate) return "⟁ Reflection cannot go down";
  }
  return projectAccountErr(draft, program);
}

/** First setfees (on-chain sum is 0). Null = ok. */
export function taxCreateValid(draft: TaxDraft, program: FlexProgram): string | null {
  return taxRateValid(draft, program, null) ?? taxChannelValid(draft, program);
}

/** Later setfees. Uses the same ⟁ strings as the contract. */
export function taxAdjustValid(draft: TaxDraft, program: FlexProgram, chain: TaxDraft): string | null {
  return taxRateValid(draft, program, chain) ?? taxChannelValid(draft, program);
}

export function taxFromSettings(
  program: FlexProgram,
  settings: Record<string, unknown> | null | undefined
): TaxDraft {
  const base = defaultTaxDraft(program);
  if (!settings) {
    return { ...base, reflectionRate: 0, burnRate: 0, projectRate: 0 };
  }
  const num = (k: string, fallback: number) => {
    const n = Number(settings[k]);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  };
  return {
    reflectionRate: num("reflection_rate", 0),
    burnRate: num("burn_rate", 0),
    projectRate: hasProjectTax(program) ? num("project_rate", 0) : 0,
    projectAccount: hasProjectTax(program) ? String(settings.project_account ?? "").trim() : "",
    angelNumbersBps: hasAngelChannels(program) ? num("angel_numbers_bps", 0) : 0,
    jackpotBps: hasAngelChannels(program) ? num("jackpot_bps", 0) : 0,
  };
}
