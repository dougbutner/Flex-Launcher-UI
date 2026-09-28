import { createConnection, createPool, type Pool, type ResultSetHeader } from "mysql2/promise";
import { sqlStatements } from "./sqlText";

export type Env = Record<string, string | undefined>;

export type Sql = {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId: number }>;
};

export class DbConfigError extends Error {
  code = "NO_DB";
  constructor() {
    super("MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.");
  }
}

export type MysqlConfig = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
  ssl: boolean;
};

let pool: Pool | null = null;
let poolSig = "";
let bootstrapped = false;

export function mysqlConfig(env: Env = {}): MysqlConfig | null {
  const host = String(env.MYSQL_HOST || process.env.MYSQL_HOST || "").trim();
  const user = String(env.MYSQL_USER || process.env.MYSQL_USER || "").trim();
  const password = String(env.MYSQL_PASSWORD ?? process.env.MYSQL_PASSWORD ?? "");
  const database = String(env.MYSQL_DATABASE || process.env.MYSQL_DATABASE || "").trim();
  const port = Number(env.MYSQL_PORT || process.env.MYSQL_PORT || 3306) || 3306;
  const ssl = String(env.MYSQL_SSL || process.env.MYSQL_SSL || "").trim() === "1";
  if (!host || !user || !database) return null;
  return { host, user, password, database, port, ssl };
}

function isWorker(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}

function connOptions(cfg: MysqlConfig) {
  return {
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    port: cfg.port,
    connectTimeout: 10_000,
    charset: "utf8mb4",
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: true,
    disableEval: true,
    ssl: cfg.ssl ? { rejectUnauthorized: true } : undefined,
  };
}

function wrap(conn: { query: Pool["query"] }): Sql {
  return {
    async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const [rows] = await conn.query(sql, params);
      return (Array.isArray(rows) ? rows : []) as T[];
    },
    async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const rows = await this.all<T>(sql, params);
      return rows[0] ?? null;
    },
    async run(sql: string, params: unknown[] = []) {
      const [res] = await conn.query(sql, params);
      const header = res as ResultSetHeader;
      return { affectedRows: Number(header?.affectedRows || 0), insertId: Number(header?.insertId || 0) };
    },
  };
}

async function bootstrap(target: Pool) {
  if (bootstrapped || isWorker()) return;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const file = path.resolve(process.cwd(), "sql/schema.sql");
  if (!fs.existsSync(file)) return;
  const sql = fs.readFileSync(file, "utf8");
  for (const stmt of sqlStatements(sql)) {
    await target.query(stmt);
  }
  bootstrapped = true;
}

export async function withDb<T>(env: Env, fn: (q: Sql) => Promise<T>): Promise<T> {
  const cfg = mysqlConfig(env);
  if (!cfg) throw new DbConfigError();
  const options = connOptions(cfg);
  if (isWorker()) {
    const conn = await createConnection(options);
    try {
      return await fn(wrap(conn));
    } finally {
      await conn.end();
    }
  }
  const sig = `${cfg.host}|${cfg.user}|${cfg.database}|${cfg.port}|${cfg.ssl ? 1 : 0}`;
  if (!pool || poolSig !== sig) {
    if (pool) await pool.end().catch(() => undefined);
    pool = createPool({ ...options, connectionLimit: 4, waitForConnections: true });
    poolSig = sig;
    bootstrapped = false;
    await bootstrap(pool);
  }
  return fn(wrap(pool));
}
