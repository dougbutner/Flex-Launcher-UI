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

/** Percent string for bps (100 bps = 1%). */
export function bpsToPercentInput(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return "0";
  const pct = bps / 100;
  if (Number.isInteger(pct)) return String(pct);
  return String(Math.round(pct * 100) / 100);
}

/** Parse a percent field into bps. Empty / invalid → 0. */
export function percentInputToBps(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10000, Math.round(n * 100));
}

export function formatBpsPercent(bps: number): string {
  return `${bpsToPercentInput(bps)}%`;
}

/** Create-time validation. Null = ok. */
export function taxCreateValid(draft: TaxDraft, program: FlexProgram): string | null {
  const sum = taxSum(draft, program);
  if (sum <= 0) return "Overall transfer tax must be greater than 0%.";
  if (sum > 10000) return "Overall transfer tax cannot exceed 100%.";
  if (hasProjectTax(program) && draft.projectAccount.trim()) {
    if (!validAccount(draft.projectAccount.trim().toLowerCase())) {
      return "Project account must be a valid XPR name (or leave blank for the issuer).";
    }
  }
  if (hasAngelChannels(program)) {
    if (channelSum(draft) > 10000) return "Angel + jackpot cannot exceed 100% of the reflection slice.";
  }
  return null;
}

/** setfees-time validation. lockedTotal is the on-chain sum that must be preserved. */
export function taxSetfeesValid(draft: TaxDraft, program: FlexProgram, lockedTotal: number): string | null {
  const sum = taxSum(draft, program);
  if (sum !== lockedTotal) {
    return `Bucket split must stay ${formatBpsPercent(lockedTotal)} overall (now ${formatBpsPercent(sum)}).`;
  }
  if (hasProjectTax(program) && draft.projectAccount.trim()) {
    if (!validAccount(draft.projectAccount.trim().toLowerCase())) {
      return "Project account must be a valid XPR name.";
    }
  }
  return null;
}

export function taxFromSettings(
  program: FlexProgram,
  settings: Record<string, unknown> | null | undefined
): TaxDraft {
  const base = defaultTaxDraft(program);
  if (!settings) return base;
  const num = (k: string, fallback: number) => {
    const n = Number(settings[k]);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  };
  return {
    reflectionRate: num("reflection_rate", base.reflectionRate),
    burnRate: num("burn_rate", base.burnRate),
    projectRate: hasProjectTax(program) ? num("project_rate", base.projectRate) : 0,
    projectAccount: hasProjectTax(program) ? String(settings.project_account ?? "").trim() : "",
    angelNumbersBps: hasAngelChannels(program) ? num("angel_numbers_bps", 0) : 0,
    jackpotBps: hasAngelChannels(program) ? num("jackpot_bps", 0) : 0,
  };
}
