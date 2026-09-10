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

function flexContracts(env) {
  return new Set(
    [env.VITE_EASYFLEX || "3asy", env.VITE_COMPLEXFLEX || "fl3x", env.VITE_FLEXFOREX_CONTRACT || "for3x"].map((s) =>
      String(s).trim().toLowerCase()
    )
  );
}

function validAccount(name) {
  return /^[a-z1-5.]{1,12}$/.test(name) && !name.startsWith(".") && !name.endsWith(".");
}

function validSymbol(code) {
  return /^[A-Z]{1,7}$/.test(code);
}

function parseToken(raw) {
  if (!raw || typeof raw !== "object") return null;
  const issuer = String(raw.issuer || "").trim().toLowerCase();
  const contract = String(raw.contract || "").trim().toLowerCase();
  const symbol = String(raw.symbol || "").trim().toUpperCase();
  const program = String(raw.program || "").trim();
  if (!validAccount(issuer) || !validAccount(contract) || !validSymbol(symbol) || !PROGRAMS.has(program)) return null;
  return { ...raw, issuer, contract, symbol, program };
}

async function ensureSchema(db) {
  await db.exec(SCHEMA);
}

export async function onRequestGet({ request, env }) {
  const db = env.MANAGER_DB;
  if (!db) {
    return Response.json({ error: "Manager SQLite is not bound. Use npm run dev, or bind D1 as MANAGER_DB." }, { status: 503 });
  }
  await ensureSchema(db);
  const url = new URL(request.url);
  const issuer = (url.searchParams.get("issuer") || "").trim().toLowerCase();
  const contract = (url.searchParams.get("contract") || "").trim().toLowerCase();
  if (!issuer && !contract) return Response.json({ error: "Pass issuer or contract." }, { status: 400 });
  let rows;
  if (issuer && contract) {
    rows = await db.prepare("SELECT json FROM tokens WHERE issuer = ? AND contract = ? ORDER BY symbol").bind(issuer, contract).all();
  } else if (issuer) {
    rows = await db.prepare("SELECT json FROM tokens WHERE issuer = ? ORDER BY contract, symbol").bind(issuer).all();
  } else {
    rows = await db.prepare("SELECT json FROM tokens WHERE contract = ? ORDER BY symbol").bind(contract).all();
  }
  const tokens = (rows.results || [])
    .map((r) => {
      try {
        return parseToken(JSON.parse(r.json));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return Response.json({ tokens });
}

export async function onRequestPut({ request, env }) {
  const db = env.MANAGER_DB;
  if (!db) {
    return Response.json({ error: "Manager SQLite is not bound. Use npm run dev, or bind D1 as MANAGER_DB." }, { status: 503 });
  }
  await ensureSchema(db);
  let body;
  try {
    body = parseToken(await request.json());
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body) return Response.json({ error: "Invalid token row." }, { status: 400 });
  if (!flexContracts(env).has(body.contract)) {
    return Response.json({ error: "Unknown flex contract." }, { status: 400 });
  }
  if (!body.createTx) {
    return Response.json({ error: "Store a row only after the first successful create." }, { status: 400 });
  }
  const existing = await db
    .prepare("SELECT issuer, json FROM tokens WHERE contract = ? AND symbol = ?")
    .bind(body.contract, body.symbol)
    .first();
  if (existing?.issuer && existing.issuer !== body.issuer) {
    return Response.json({ error: "That ticker is already stored for another issuer." }, { status: 409 });
  }
  let prev = null;
  try {
    prev = existing?.json ? JSON.parse(existing.json) : null;
  } catch {
    prev = null;
  }
  const now = Date.now();
  const token = { ...body, createdAt: prev?.createdAt || body.createdAt || now, updatedAt: now };
  await db
    .prepare(
      `INSERT INTO tokens (contract, symbol, issuer, json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(contract, symbol) DO UPDATE SET
         issuer = excluded.issuer,
         json = excluded.json,
         updated_at = excluded.updated_at`
    )
    .bind(token.contract, token.symbol, token.issuer, JSON.stringify(token), now)
    .run();
  return Response.json({ token });
}

export async function onRequestPost(ctx) {
  return onRequestPut(ctx);
}
