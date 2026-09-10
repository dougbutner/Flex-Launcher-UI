import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { DatabaseSync } from "node:sqlite";
import type { Plugin } from "vite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tokens (
  contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  issuer TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (contract, symbol)
);
CREATE INDEX IF NOT EXISTS idx_tokens_issuer ON tokens(issuer);
CREATE INDEX IF NOT EXISTS idx_tokens_contract ON tokens(contract);
`;

const PROGRAMS = new Set(["easyflex", "complexflex", "flexforex"]);

type StoredToken = {
  issuer: string;
  contract: string;
  symbol: string;
  program: string;
  createTx: string;
  [k: string]: unknown;
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, cap: number): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > cap) throw new Error("Body too large.");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validAccount(name: string) {
  return /^[a-z1-5.]{1,12}$/.test(name) && !name.startsWith(".") && !name.endsWith(".");
}

function parseBody(raw: unknown): StoredToken | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const issuer = String(o.issuer ?? "").trim().toLowerCase();
  const contract = String(o.contract ?? "").trim().toLowerCase();
  const symbol = String(o.symbol ?? "").trim().toUpperCase();
  const program = String(o.program ?? "").trim();
  const createTx = String(o.createTx ?? "").trim();
  if (!validAccount(issuer) || !validAccount(contract)) return null;
  if (!/^[A-Z]{1,7}$/.test(symbol) || !PROGRAMS.has(program) || !createTx) return null;
  return { ...o, issuer, contract, symbol, program, createTx };
}

function flexContracts(env: Record<string, string>): Set<string> {
  return new Set(
    [
      env.VITE_EASYFLEX?.trim() || "3asy",
      env.VITE_COMPLEXFLEX?.trim() || "fl3x",
      env.VITE_FLEXFOREX_CONTRACT?.trim() || "for3x",
    ].map((s) => s.toLowerCase())
  );
}

function openDb(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

function readStored(raw: string): StoredToken | null {
  try {
    return parseBody(JSON.parse(raw));
  } catch {
    return null;
  }
}

function handleGet(db: DatabaseSync, url: URL, res: ServerResponse) {
  const issuer = (url.searchParams.get("issuer") || "").trim().toLowerCase();
  const contract = (url.searchParams.get("contract") || "").trim().toLowerCase();
  if (!issuer && !contract) {
    send(res, 400, { error: "Pass issuer or contract." });
    return;
  }
  let rows: unknown[];
  if (issuer && contract) {
    rows = db.prepare("SELECT json FROM tokens WHERE issuer = ? AND contract = ? ORDER BY symbol").all(issuer, contract);
  } else if (issuer) {
    rows = db.prepare("SELECT json FROM tokens WHERE issuer = ? ORDER BY contract, symbol").all(issuer);
  } else {
    rows = db.prepare("SELECT json FROM tokens WHERE contract = ? ORDER BY symbol").all(contract);
  }
  const tokens = rows
    .map((r) => readStored(String((r as { json: string }).json)))
    .filter((row): row is StoredToken => Boolean(row));
  send(res, 200, { tokens });
}

function handlePut(db: DatabaseSync, allowed: Set<string>, body: StoredToken, res: ServerResponse) {
  if (!allowed.has(body.contract)) {
    send(res, 400, { error: "Unknown flex contract." });
    return;
  }
  const existingRaw = db
    .prepare("SELECT issuer, json FROM tokens WHERE contract = ? AND symbol = ?")
    .get(body.contract, body.symbol) as { issuer?: string; json?: string } | undefined;
  if (existingRaw?.issuer && existingRaw.issuer !== body.issuer) {
    send(res, 409, { error: "That ticker is already stored for another issuer." });
    return;
  }
  const prev = existingRaw?.json ? readStored(existingRaw.json) : null;
  const now = Date.now();
  const token = {
    ...body,
    createdAt: Number(prev?.createdAt || body.createdAt || now),
    updatedAt: now,
  };
  db.prepare(
    `INSERT INTO tokens (contract, symbol, issuer, json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(contract, symbol) DO UPDATE SET
       issuer = excluded.issuer,
       json = excluded.json,
       updated_at = excluded.updated_at`
  ).run(token.contract, token.symbol, token.issuer, JSON.stringify(token), now);
  send(res, 200, { token });
}

export function managerDbPlugin(env: Record<string, string>): Plugin {
  const file = path.resolve(process.cwd(), env.MANAGER_SQLITE?.trim() || "data/manager.sqlite");
  const allowed = flexContracts(env);
  let db: DatabaseSync | null = null;

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/api/manager") {
      next();
      return;
    }
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    db ??= openDb(file);
    if (req.method === "GET") {
      handleGet(db, url, res);
      return;
    }
    if (req.method === "PUT" || req.method === "POST") {
      void readBody(req, 64_000)
        .then((text) => {
          const parsed = parseBody(JSON.parse(text || "{}"));
          if (!parsed) {
            send(res, 400, { error: "Invalid token row. Need issuer, contract, symbol, program, and createTx." });
            return;
          }
          handlePut(db as DatabaseSync, allowed, parsed, res);
        })
        .catch((err) => {
          send(res, 400, { error: err instanceof Error ? err.message : String(err) });
        });
      return;
    }
    send(res, 405, { error: "GET or PUT /api/manager." });
  };

  return {
    name: "manager-db",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
