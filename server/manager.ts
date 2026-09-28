import { flexContracts, parseManagerToken, validAccount } from "./accounts";
import type { Env, Sql } from "./db";

function readStored(raw: unknown): Record<string, unknown> | null {
  try {
    const text = typeof raw === "string" ? raw : "";
    return parseManagerToken(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function listManager(q: Sql, url: URL) {
  const issuer = (url.searchParams.get("issuer") || "").trim().toLowerCase();
  const contract = (url.searchParams.get("contract") || "").trim().toLowerCase();
  if (issuer && !validAccount(issuer)) return { status: 400, body: { error: "Bad issuer." } };
  if (contract && !validAccount(contract)) return { status: 400, body: { error: "Bad contract." } };
  if (!issuer && !contract) return { status: 400, body: { error: "Pass issuer or contract." } };
  let rows: Array<{ body?: string }>;
  if (issuer && contract) {
    rows = await q.all("SELECT body FROM manager_tokens WHERE issuer = ? AND contract = ? ORDER BY symbol", [issuer, contract]);
  } else if (issuer) {
    rows = await q.all("SELECT body FROM manager_tokens WHERE issuer = ? ORDER BY contract, symbol", [issuer]);
  } else {
    rows = await q.all("SELECT body FROM manager_tokens WHERE contract = ? ORDER BY symbol", [contract]);
  }
  const tokens = rows.map((row) => readStored(row.body)).filter((row): row is Record<string, unknown> => Boolean(row));
  return { status: 200, body: { tokens } };
}

export async function putManager(q: Sql, env: Env, raw: unknown) {
  const body = parseManagerToken(raw);
  if (!body) return { status: 400, body: { error: "Invalid token row. Need issuer, contract, symbol, program, and createTx." } };
  const contract = String(body.contract);
  const symbol = String(body.symbol);
  const issuer = String(body.issuer);
  if (!flexContracts(env).has(contract)) return { status: 400, body: { error: "Unknown flex contract." } };
  const existing = await q.get<{ issuer?: string; body?: string }>(
    "SELECT issuer, body FROM manager_tokens WHERE contract = ? AND symbol = ?",
    [contract, symbol]
  );
  if (existing?.issuer && existing.issuer !== issuer) {
    return { status: 409, body: { error: "That ticker is already stored for another issuer." } };
  }
  const prev = existing?.body ? readStored(existing.body) : null;
  const now = Date.now();
  const token = { ...body, createdAt: Number(prev?.createdAt || body.createdAt || now), updatedAt: now };
  await q.run(
    `INSERT INTO manager_tokens (contract, symbol, issuer, body, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE issuer = VALUES(issuer), body = VALUES(body), updated_at = VALUES(updated_at)`,
    [contract, symbol, issuer, JSON.stringify(token), now]
  );
  return { status: 200, body: { token } };
}
