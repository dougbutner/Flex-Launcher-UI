import { describe, expect, it } from "vitest";
import {
  AIRDROP_BATCH,
  airdropTransfers,
  batchCount,
  batchOf,
  budgetToRaw,
  clampMemo,
  debitForSend,
  formatRawFace,
  holdersFitInRam,
  holderTableScope,
  isDroppableToken,
  keepHolder,
  MEMO_MAX_BYTES,
  needMoreHolders,
  planDrop,
  ramPerNewHolder,
  sortOwnedFirst,
} from "@/services/airdrop";

describe("airdrop", () => {
  it("allows flex contracts and EASY, WON, GRAMS, MEME", () => {
    expect(isDroppableToken("fl3x", "GEASY")).toBe(true);
    expect(isDroppableToken("3asy", "FOO")).toBe(true);
    expect(isDroppableToken("for3x", "BAR")).toBe(true);
    expect(isDroppableToken("mon3y", "EASY")).toBe(true);
    expect(isDroppableToken("m3m3", "MEME")).toBe(true);
    expect(isDroppableToken("w3won", "WON")).toBe(true);
    expect(isDroppableToken("gold.mon3y", "GRAMS")).toBe(true);
    expect(isDroppableToken("eosio.token", "XPR")).toBe(true);
    expect(isDroppableToken("loan.token", "LOAN")).toBe(true);
    expect(isDroppableToken("xtokens", "METAL")).toBe(true);
    expect(isDroppableToken("xtokens", "XUSDC")).toBe(true);
    expect(isDroppableToken("electronteam", "DANK")).toBe(true);
    expect(isDroppableToken("mon3y", "NOPE")).toBe(false);
  });

  it("scopes legacy holder tables by contract and new ones by symbol", () => {
    expect(holderTableScope("mon3y", "EASY")).toBe("mon3y");
    expect(holderTableScope("m3m3", "MEME")).toBe("m3m3");
    expect(holderTableScope("fl3x", "geasy")).toBe("GEASY");
  });

  it("gives every account the same per-account amount", () => {
    const plan = planDrop(
      "uniform",
      1000n,
      [
        { account: "a", weightRaw: 9n },
        { account: "b", weightRaw: 1n },
        { account: "c", weightRaw: 1n },
      ]
    );
    expect(plan.map((row) => row.amountRaw)).toEqual([1000n, 1000n, 1000n]);
    expect(plan.reduce((sum, row) => sum + row.amountRaw, 0n)).toBe(3000n);
    expect(batchOf(plan, 0, 2).map((row) => row.amountRaw)).toEqual([1000n, 1000n]);
    expect(batchOf(plan, 1, 2).map((row) => row.amountRaw)).toEqual([1000n]);
  });

  it("fixes proportional amounts from the full set so later batches stay put", () => {
    const holders = [
      { account: "a", weightRaw: 50n },
      { account: "b", weightRaw: 30n },
      { account: "c", weightRaw: 20n },
      { account: "d", weightRaw: 10n },
    ];
    const plan = planDrop("proportional", 1000n, holders);
    expect(plan.map((row) => row.amountRaw)).toEqual([454n, 272n, 181n, 90n]);
    expect(plan.reduce((sum, row) => sum + row.amountRaw, 0n)).toBeLessThanOrEqual(1000n);
    expect(batchOf(plan, 1, 2).map((row) => row.amountRaw)).toEqual(plan.slice(2).map((row) => row.amountRaw));
    expect(batchCount(plan.length, AIRDROP_BATCH)).toBe(1);
    expect(batchCount(250, AIRDROP_BATCH)).toBe(3);
  });

  it("adds wallet tax on top per bucket", () => {
    expect(debitForSend(10_000n, { reflection: 100, burn: 100, project: 0 }, false)).toBe(10_200n);
    expect(debitForSend(10_000n, { reflection: 200, burn: 0, project: 100 }, false)).toBe(10_300n);
    expect(debitForSend(10_000n, { reflection: 200, burn: 0, project: 100 }, true)).toBe(10_000n);
  });

  it("asks for more holders only when a full positive page is still short", () => {
    const positive = (n: number) => Array.from({ length: n }, (_, i) => ({ account: `a${i}`, weightRaw: 1n }));
    const withZero = [...positive(40), { account: "z", weightRaw: 0n }];
    expect(needMoreHolders(100, 100, positive(100), 99)).toBe(true);
    expect(needMoreHolders(100, 100, positive(100), 100)).toBe(false);
    expect(needMoreHolders(100, 100, withZero, 30)).toBe(false);
    expect(needMoreHolders(5000, 1000, positive(1000), 997)).toBe(true);
    expect(needMoreHolders(5000, 1000, positive(40), 40)).toBe(false);
  });

  it("skips the sender, contracts, and swap.alcor", () => {
    expect(keepHolder("alice", "alice", ["fl3x"])).toBe(false);
    expect(keepHolder("swap.alcor", "alice", ["fl3x"])).toBe(false);
    expect(keepHolder("fl3x", "alice", ["fl3x"])).toBe(false);
    expect(keepHolder("bob", "alice", ["fl3x"])).toBe(true);
  });

  it("caps the memo at the chain byte limit and estimates RAM", () => {
    expect(clampMemo("a".repeat(MEMO_MAX_BYTES + 40)).length).toBe(MEMO_MAX_BYTES);
    expect(utf8Safe("é")).toBe(true);
    expect(holdersFitInRam(1000, ramPerNewHolder("fl3x"))).toBe(3);
    expect(holdersFitInRam(0, 280)).toBe(0);
    expect(budgetToRaw("1.5", 4)).toBe(15_000n);
    expect(budgetToRaw("0", 4)).toBeNull();
    expect(formatRawFace(4_200_000_000n, 6, "GEASY")).toBe("4,200 GEASY");
    expect(formatRawFace(4_199_999_916n, 6, "GEASY")).toBe("4,199.999916 GEASY");
  });

  it("builds one transfer per checked positive amount", () => {
    const actions = airdropTransfers({
      contract: "fl3x",
      from: "alice",
      precision: 4,
      symbol: "GEASY",
      memo: "hello",
      rows: [
        { account: "bob", amountRaw: 10000n },
        { account: "carol", amountRaw: 0n },
        { account: "alice", amountRaw: 10000n },
      ],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.data).toMatchObject({ from: "alice", to: "bob", quantity: "1.0000 GEASY", memo: "hello" });
  });

  it("lists issued tokens before other balances", () => {
    const sorted = sortOwnedFirst([
      { owned: false, symbol: "EASY", contract: "mon3y" },
      { owned: true, symbol: "ZZZ", contract: "fl3x" },
      { owned: true, symbol: "AAA", contract: "fl3x" },
    ]);
    expect(sorted.map((row) => row.symbol)).toEqual(["AAA", "ZZZ", "EASY"]);
  });
});

function utf8Safe(ch: string): boolean {
  return clampMemo(ch.repeat(200)).length < 200;
}
