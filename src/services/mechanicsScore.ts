/** Holder mechanics score, 0-100. Holdings 50, main-pool LP 30, 24h activity 20. */

export const HOLD_MAX = 50;
export const HOLD_STEP = 0.5;
export const HOLD_RANKS = 100;
export const LP_MAX = 30;
export const ACTIVITY_MAX = 20;

export function holdScoreFromRank(rank: number): number {
  if (!Number.isFinite(rank) || rank < 1 || rank > HOLD_RANKS) return 0;
  return HOLD_MAX - (rank - 1) * HOLD_STEP;
}

/** Rank 1 is the largest balance. Ties keep the first sorted name. */
export function rankHolders(rows: Array<{ owner: string; raw: number }>): Map<string, number> {
  const ranked = [...rows]
    .filter((r) => r.owner && r.raw > 0)
    .sort((a, b) => b.raw - a.raw || a.owner.localeCompare(b.owner));
  const out = new Map<string, number>();
  ranked.forEach((row, i) => {
    out.set(row.owner, i + 1);
  });
  return out;
}

export function lpScoreFromShare(userLiq: number, totalLiq: number): number {
  if (!(userLiq > 0) || !(totalLiq > 0)) return 0;
  return Math.min(LP_MAX, (userLiq / totalLiq) * LP_MAX);
}

/** One point per message, token tx, and whole EASY received via UP in 24h, capped at 20. */
export function activityScore(messages24h: number, txs24h: number, ups24h = 0): number {
  const messages = Number.isFinite(messages24h) ? Math.max(0, messages24h) : 0;
  const txs = Number.isFinite(txs24h) ? Math.max(0, txs24h) : 0;
  const ups = Number.isFinite(ups24h) ? Math.max(0, ups24h) : 0;
  return Math.min(ACTIVITY_MAX, messages + txs + ups);
}

export function mechanicsTotal(hold: number, lp: number, activity: number): number {
  const n = (Number.isFinite(hold) ? hold : 0) + (Number.isFinite(lp) ? lp : 0) + (Number.isFinite(activity) ? activity : 0);
  return Math.max(0, Math.min(100, Math.round(n)));
}

export type ScoreParts = {
  hold: number;
  lp: number;
  activity: number;
  total: number;
  rank: number | null;
};

export function scoreParts(input: {
  rank: number | null;
  userLiq: number;
  totalLiq: number;
  messages24h: number;
  txs24h: number;
  ups24h?: number;
}): ScoreParts {
  const hold = input.rank == null ? 0 : holdScoreFromRank(input.rank);
  const lp = lpScoreFromShare(input.userLiq, input.totalLiq);
  const activity = activityScore(input.messages24h, input.txs24h, input.ups24h ?? 0);
  return { hold, lp, activity, total: mechanicsTotal(hold, lp, activity), rank: input.rank };
}
