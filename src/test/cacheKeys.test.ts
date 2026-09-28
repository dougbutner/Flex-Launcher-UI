import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bookCacheKey, canonCacheKey, isCacheFresh, marketCacheKey, marksCacheKey, metricsCacheKey, tokenCacheKey } from "@/services/cacheKeys";
import { chainTxBody, rainTargets, symbolFromAction } from "@/services/chainTxReport";
import { sqlStatements } from "../../server/sqlText";

describe("cache keys", () => {
  it("keeps a snapshot fresh for 15 seconds", () => {
    const at = 1_000_000;
    expect(isCacheFresh(at, at + 14_999)).toBe(true);
    expect(isCacheFresh(at, at + 15_000)).toBe(false);
    expect(isCacheFresh(0, at)).toBe(false);
  });

  it("normalizes market and token keys", () => {
    expect(marketCacheKey("For3x", "foo", 12)).toBe("market:for3x:FOO:12");
    expect(tokenCacheKey("FL3X", "bar")).toBe("token:fl3x:BAR");
    expect(canonCacheKey("market:Gold.Mon3y:grams:9")).toBe("market:gold.mon3y:GRAMS:9");
    expect(bookCacheKey("fl3x", "geasy")).toBe("book:fl3x:GEASY");
    expect(canonCacheKey("book:FL3X:geasy")).toBe("book:fl3x:GEASY");
    expect(marksCacheKey("fl3x", "geasy")).toBe("marks:fl3x:GEASY");
    expect(metricsCacheKey("fl3x", "geasy", 11525)).toBe("metrics:fl3x:GEASY:11525");
    expect(canonCacheKey("metrics:FL3X:geasy:0")).toBe("metrics:fl3x:GEASY:0");
    expect(canonCacheKey("board:tokens")).toBe("board:tokens");
    expect(canonCacheKey("drop table")).toBe(null);
  });
});

describe("chain tx log", () => {
  it("reads the symbol and rain targets from a signed action", () => {
    const tx = "a".repeat(64);
    const body = chainTxBody(
      "alice",
      [{ account: "for3x", name: "makeitrain", data: { token_symbol: "FOO", keeper: "alice" } }],
      { transaction_id: tx }
    );
    expect(body.txId).toBe(tx);
    expect(body.actor).toBe("alice");
    expect(body.contract).toBe("for3x");
    expect(body.action).toBe("makeitrain");
    expect(body.symbol).toBe("FOO");
    expect(symbolFromAction({ account: "mon3y", name: "distribute", data: {} })).toBe("EASY");
    expect(rainTargets([{ account: "w3won", name: "radiate", data: {} }])).toEqual([{ contract: "w3won", symbol: "WON" }]);
    expect(rainTargets([{ account: "for3x", name: "transfer", data: {} }])).toEqual([]);
  });
});

describe("sql files", () => {
  const root = path.resolve(process.cwd());
  const schema = fs.readFileSync(path.join(root, "sql/schema.sql"), "utf8");
  const data = fs.readFileSync(path.join(root, "sql/data.sql"), "utf8");

  it("creates the store, snapshots, and tx log", () => {
    for (const table of ["site_settings", "manager_tokens", "posts", "tips", "ups", "captcha", "cache_entries", "chain_txs"]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sqlStatements(schema)).toHaveLength(8);
    expect(data).toContain("INSERT INTO site_settings");
    expect(data).not.toContain("MYSQL_PASSWORD");
  });
});
