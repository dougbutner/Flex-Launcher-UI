function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function txIdFromResult(result: unknown): string {
  const r = asRecord(result);
  if (!r) return "";
  const processed = asRecord(r.processed);
  const transaction = asRecord(r.transaction);
  const response = asRecord(r.response);
  const id =
    (typeof r.transaction_id === "string" && r.transaction_id) ||
    (typeof processed?.id === "string" && processed.id) ||
    (typeof transaction?.id === "string" && transaction.id) ||
    (typeof response?.transaction_id === "string" && response.transaction_id) ||
    "";
  return id;
}

function walk(node: unknown, acts: Array<{ name?: string; data?: Record<string, unknown> }>) {
  if (!node) return;
  const list = Array.isArray(node) ? node : [node];
  for (const item of list) {
    const rec = asRecord(item);
    if (!rec) continue;
    const act = asRecord(rec.act) || asRecord(rec.action);
    if (act && typeof act.name === "string") {
      acts.push({ name: act.name, data: asRecord(act.data) ?? undefined });
    }
    walk(rec.inline_traces, acts);
    walk(rec.inlineTraces, acts);
    walk(rec.traces, acts);
    walk(rec.action_traces, acts);
  }
}

export function logpoolIdFromResult(result: unknown): number | null {
  const r = asRecord(result);
  if (!r) return null;
  const acts: Array<{ name?: string; data?: Record<string, unknown> }> = [];
  walk(r, acts);
  walk(asRecord(r.processed), acts);
  walk(asRecord(r.response), acts);
  const log = acts.find((a) => a.name === "logpool");
  const id = log?.data?.poolId ?? log?.data?.pool_id;
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export function txErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const rec = asRecord(err);
  if (!rec) return "Transaction failed.";
  const error = asRecord(rec.error);
  const details = error?.details;
  if (Array.isArray(details) && details[0] && typeof asRecord(details[0])?.message === "string") {
    return String(asRecord(details[0])?.message);
  }
  if (typeof error?.what === "string") return error.what;
  if (typeof rec.message === "string") return rec.message;
  try {
    return JSON.stringify(err);
  } catch {
    return "Transaction failed.";
  }
}

/** Needles mirror flexforex.cpp check() strings (they ship with a 🜚 prefix). */
const HINTS: Array<[string, string]> = [
  ["overdrawn", "Need ≥ 5,000 XPR for contract RAM, plus extra for Alcor."],
  ["insufficient", "Need ≥ 5,000 XPR for contract RAM, plus extra for Alcor."],
  ["missing authority", "token.proton logos must be signed by the token contract (tcontract@active)."],
  ["unable to retrieve account", "The flex contract is not a live account — check VITE_FLEXFOREX_CONTRACT."],
  ["unknown key", "The flex contract is not a live account — check VITE_FLEXFOREX_CONTRACT."],
  ["Fail to retrieve account", "The flex contract is not deployed yet."],
  ["token with symbol already exists", "That ticker is taken — pick another."],
  ["exceeds max supply", "Mint exactly the forged max supply, no more."],
  ["mint 100% of supply before stamp", "Run the mint step first."],
  ["issuer position has no liquidity", "Run addliquid before stamp."],
  ["Place a one-sided Alcor range", "Token not stamped; finish lock + stamp. Transfers only go to swap.alcor until then."],
  ["reglaunch first", "Run register before stamp."],
  ["already stamped; launch params are locked", "Launch params are locked — register is closed for this token."],
  ["already stamped", "Launch finished."],
  ["flex quotes do not use proof_pool_id", "Flex quotes take proof pool 0."],
  ["quote must be a zero-amount", "Quote quantity must be zero in reglaunch."],
  ["quote contract does not exist", "Quote token contract is not a live account."],
  ["sqrt_price_x64 required", "Start price missing — recompute the range step."],
  ["tick_lower must be < tick_upper", "Lower tick must sit under upper tick."],
  ["ticks out of Alcor range", "Ticks must stay inside ±443636."],
  ["ticks must be multiples of tickSpacing", "Snap prices to the fee tier spacing."],
  ["pool fee does not match reglaunch", "Create the pool with the registered fee tier."],
  ["pool must pair this flex token with the registered quote", "Pool pair differs from the registered quote."],
  ["pool quote does not match reglaunch", "Pool quote differs from registration."],
  ["proof pool", "Pick a deeper xtoken market (≥ 10 XUSDC or ≥ 1,000 XPR inventory)."],
  ["10 XUSDC", "Pick a deeper xtoken market."],
  ["1000 XPR", "Pick a deeper xtoken market."],
  ["pool is not active", "Pay activeFee with memo activepool#id."],
  ["ticks must match", "Same ticks as register / addliquid / lockpos."],
  ["100% of supply must sit on swap.alcor", "Deposit the full mint; no leftover in the wallet."],
  ["unused Alcor balance must be 0", "addliquid did not consume the deposit."],
  ["lock ≥ 90 days", "Increase unlockTime."],
  ["one-sided launch", "Start price is inside the range or on the wrong side of tokenA/tokenB."],
  ["fee must be 500, 3000, or 10000", "Invalid fee tier."],
  ["keeper required", "Sign reflect with the account collecting the keeper tip."],
  ["no reflections to distribute", "Pools are below threshold — wait for more volume."],
];

export function hintForError(message: string): string | null {
  const hit = HINTS.find(([needle]) => message.includes(needle));
  return hit?.[1] ?? null;
}
