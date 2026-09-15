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
  walk(r.actions, acts);
  walk(r.traces, acts);
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

/** Needles mirror check() strings (they ship with a ⟁ prefix). */
const HINTS: Array<[string, string]> = [
  ["overdrawn", "Not enough balance for this transaction."],
  ["insufficient", "Not enough balance for this transaction."],
  ["missing authority", "token.proton::reg needs tcontract@active (3asy, fl3x, or for3x). If you signed as the issuer, ask the contract admin to sign on /admin."],
  ["max length for token name is 16", "token.proton tname is at most 16 characters."],
  ["unable to retrieve account", "The flex contract is not a live account - check VITE_EASYFLEX / VITE_COMPLEXFLEX / VITE_FLEXFOREX_CONTRACT."],
  ["unknown key", "The flex contract is not a live account - check VITE_EASYFLEX / VITE_COMPLEXFLEX / VITE_FLEXFOREX_CONTRACT."],
  ["Fail to retrieve account", "The flex contract is not deployed yet."],
  ["token with symbol already exists", "That ticker is taken - pick another."],
  ["exceeds max supply", "Mint or issue exactly the created max supply, no more."],
  ["mint 100% of supply before", "Run the mint/issue step first."],
  ["issuer position has no liquidity", "Run addliquid before liftoff."],
  ["Place a one-sided Alcor range", "Token not live yet; finish lock + liftoff. Transfers only go to swap.alcor until then."],
  ["startlaunch first", "Run startlaunch before liftoff."],
  ["already launched", "Launch finished."],
  ["flex quotes do not use xtoken_proof_pool_id", "Flex quotes take proof pool 0."],
  ["quote must be a zero-amount", "Quote quantity must be zero in startlaunch."],
  ["quote contract does not exist", "Quote token contract is not a live account."],
  ["sqrt_price_x64 required", "Start price missing - recompute the range step."],
  ["tick_lower must be < tick_upper", "Lower tick must sit under upper tick."],
  ["ticks out of Alcor range", "Ticks must stay inside ±443636."],
  ["ticks must be multiples of tickSpacing", "Snap prices to the fee tier spacing."],
  ["pool fee does not match startlaunch", "Create the pool with the registered fee tier."],
  ["pool must pair this flex token with the registered quote", "Pool pair differs from the registered quote."],
  ["pool quote does not match startlaunch", "Pool quote differs from startlaunch."],
  ["quote must be a flex token, xtokens, XPR, XMD, or LOAN", "Use EASY/WON/GRAMS/MEME, an xtoken, or XPR/XMD/LOAN."],
  ["xtoken launches need xtoken_proof_pool_id", "Non-flex quotes need a proof pool id greater than zero."],
  ["proof pool", "Pick a deeper quote market (≥ 10 XUSDC or ≥ 1,000 XPR inventory)."],
  ["10 XUSDC", "Pick a deeper xtoken market."],
  ["1000 XPR", "Pick a deeper xtoken market."],
  ["pool is not active", "Pay activeFee with memo activepool#id."],
  ["ticks must match", "Same ticks as startlaunch / addliquid / lockpos."],
  ["100% of supply must sit on swap.alcor", "Deposit the full supply; nothing left in the wallet."],
  ["unused Alcor balance must be 0", "addliquid did not consume the deposit."],
  ["lock ≥ 90 days", "Increase unlockTime."],
  ["fee must be 500, 3000, or 10000", "Invalid fee tier."],
  ["keeper required", "Sign makeitrain."],
  ["keeper account does not exist", "The keeper name is not a live account."],
  ["sender account does not exist", "The sender name is not a live account."],
  ["no reflections to distribute", "Pools are below threshold, add liquidity if you want to use this pair."],
  ["Hold ", "Hold enough EASY to launch (base × already-launched tokens + 1)."],
  ["EASY on mon3y", "Hold enough EASY to launch."],
  ["angel numbers not enabled", "Issuer must enable angel numbers via setdist / ratios first."],
  ["jackpot not enabled", "Issuer must enable jackpot via setdist / ratios first."],
  ["Angel numbers pot empty", "No angel numbers pot to pull yet."],
  ["Jackpot pot empty", "No jackpot pot to pull yet."],
  ["angel numbers cooldown", "Wait for the angel numbers cooldown to finish."],
  ["RNG already pending", "A pull is already waiting on rng - wait for receiverand."],
  ["Distribute already locked", "Issuer already ran setdist - only the contract can change mins/winners; use ratios for channel bps."],
  ["Only the issuer can add a flex reward token", "Sign addpool as the token issuer."],
  ["No flex pool found for that output token", "Issuer must addpool that Alcor route first."],
  ["you can remove fees, not add them back", "feeoptout is one-way for holders - only admin/issuer can reverse."],
  ["code 0-999 required", "Pick an angel number from 0 to 999."],
  ["bad inheritance data", "Beneficiary rate must be 0-10000 bps = 0.00% - 100.00% ."],
  ["bad inheritmemo data", "Custom memo must be ≤ 200 characters."],
  ["beneficiary account does not exist", "Enter a live XPR account name for the beneficiary."],
];

export function hintForError(message: string): string | null {
  const hit = HINTS.find(([needle]) => message.includes(needle));
  return hit?.[1] ?? null;
}
