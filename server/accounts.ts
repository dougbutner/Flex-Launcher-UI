import type { Env } from "./db";

const PROGRAMS = new Set(["easyflex", "complexflex", "flexforex"]);

export function flexContracts(env: Env): Set<string> {
  return new Set(
    [env.VITE_EASYFLEX || "3asy", env.VITE_COMPLEXFLEX || "fl3x", env.VITE_FLEXFOREX_CONTRACT || "for3x"].map((s) =>
      String(s).trim().toLowerCase()
    )
  );
}

export function validAccount(name: string) {
  return /^[a-z1-5.]{1,12}$/.test(name) && !name.startsWith(".") && !name.endsWith(".");
}

export function validSymbol(code: string) {
  return /^[A-Z]{1,7}$/.test(code);
}

export function parseManagerToken(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const issuer = String(o.issuer || "").trim().toLowerCase();
  const contract = String(o.contract || "").trim().toLowerCase();
  const symbol = String(o.symbol || "").trim().toUpperCase();
  const program = String(o.program || "").trim();
  const createTx = String(o.createTx || "").trim();
  if (!validAccount(issuer) || !validAccount(contract) || !validSymbol(symbol) || !PROGRAMS.has(program) || !createTx) {
    return null;
  }
  return { ...o, issuer, contract, symbol, program, createTx };
}
