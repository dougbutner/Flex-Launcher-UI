import { PROJECT_CORE_TOKENS } from "@/config/launch";
import { flexApi } from "@/services/flexApi";
import { txIdFromResult } from "@/services/txParse";

const RAIN_ACTIONS = new Set(["makeitrain", "distribute", "radiate", "reflect"]);

export type SignedAction = {
  account: string;
  name: string;
  data?: Record<string, unknown>;
};

export function symbolFromAction(action: SignedAction): string {
  const data = action.data ?? {};
  let symbol = String(data.token_symbol ?? data.symbol ?? "").trim().toUpperCase();
  if (symbol.includes(",")) symbol = symbol.split(",").pop() || "";
  symbol = symbol.replace(/[^A-Z]/g, "");
  if (/^[A-Z]{1,7}$/.test(symbol)) return symbol;
  const qty = String(data.quantity ?? "");
  const m = qty.trim().match(/([A-Z]{1,7})$/);
  if (m) return m[1];
  const core = PROJECT_CORE_TOKENS.find((t) => t.contract === action.account.trim().toLowerCase() && t.rainAction === action.name);
  return core?.symbol ?? "";
}

export function rainTargets(actions: SignedAction[]): Array<{ contract: string; symbol: string }> {
  const out: Array<{ contract: string; symbol: string }> = [];
  for (const action of actions) {
    if (!RAIN_ACTIONS.has(action.name)) continue;
    out.push({ contract: action.account.trim().toLowerCase(), symbol: symbolFromAction(action) });
  }
  return out;
}

export function chainTxBody(actor: string, actions: SignedAction[], result: unknown) {
  const txId = txIdFromResult(result).trim().toLowerCase();
  const first = actions[0];
  return {
    txId,
    actor: actor.trim().toLowerCase(),
    contract: String(first?.account ?? "").trim().toLowerCase(),
    action: String(first?.name ?? "").trim().toLowerCase(),
    symbol: first ? symbolFromAction(first) : "",
    actions: actions.map((a) => ({ account: a.account, name: a.name, data: a.data ?? {} })),
  };
}

export async function reportChainTx(actor: string | null, actions: SignedAction[], result: unknown): Promise<void> {
  if (!actor) return;
  const body = chainTxBody(actor, actions, result);
  if (!/^[0-9a-f]{64}$/.test(body.txId)) return;
  await fetch(flexApi("/api/txs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
