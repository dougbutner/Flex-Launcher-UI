import { describe, expect, it } from "vitest";
import type { BoardToken } from "@/services/leaderboardStore";
import {
  applyBoardFilters,
  boardFilterChips,
  clearBoardChip,
  EMPTY_BOARD_FILTERS,
  fmtAge,
  fmtHolders,
  matchBoardQuery,
  prettyTokenName,
  sortBoardRows,
} from "@/services/winnerBoard";
import {
  bubbleValue,
  extrasNeeded,
  packBubbles,
  parseWinnerView,
  pctFromPoints,
  winnerViewSearch,
} from "@/services/winnerViews";

const sample = (p: Partial<BoardToken> & Pick<BoardToken, "symbol">): BoardToken => ({
  id: `for3x:${p.symbol}`,
  program: "flexforex",
  contract: "for3x",
  quoteSymbol: "EASY",
  quoteContract: "mon3y",
  poolId: 1,
  firstSeenAt: 1,
  mcapUsd: 100,
  liqUsd: 40,
  volumeUsd: 10,
  holders: 7,
  ...p,
});

describe("winner view registry params", () => {
  it("defaults to tiles and locked liq", () => {
    expect(parseWinnerView(new URLSearchParams())).toEqual({ view: "tiles", size: "liq", chg: "24h" });
    expect(winnerViewSearch({ view: "tiles", size: "liq", chg: "24h" })).toBe("");
    expect(winnerViewSearch({ view: "bubbles", size: "liq", chg: "24h" })).toBe("?view=bubbles");
    expect(winnerViewSearch({ view: "bubbles", size: "change", chg: "30d" })).toBe("?view=bubbles&size=change&chg=30d");
    expect(extrasNeeded({ view: "tiles", size: "change", chg: "24h" })).toBe(false);
    expect(extrasNeeded({ view: "bubbles", size: "liq", chg: "24h" })).toBe(false);
    expect(extrasNeeded({ view: "board", size: "liq", chg: "24h" })).toBe(true);
    expect(winnerViewSearch({ view: "board", size: "liq", chg: "24h" })).toBe("?view=board");
  });

  it("sizes bubbles from locked liq unless another metric is picked", () => {
    const t = sample({ symbol: "FOO", liqUsd: 80, volumeUsd: 20, mcapUsd: 200, holders: 3 });
    const extra = { id: t.id, change24: -4, changeWeek: 8, changeMonth: 12, spark: [] };
    expect(bubbleValue(t, "liq", extra, "24h")).toBe(80);
    expect(bubbleValue(t, "volume", extra, "24h")).toBe(20);
    expect(bubbleValue(t, "mcap", extra, "24h")).toBe(200);
    expect(bubbleValue(t, "holders", extra, "24h")).toBe(3);
    expect(bubbleValue(t, "change", extra, "24h")).toBe(4);
    expect(bubbleValue(t, "change", extra, "7d")).toBe(8);
    expect(bubbleValue(t, "change", extra, "30d")).toBe(12);
  });

  it("packs larger values as larger circles without overlap", () => {
    const packed = packBubbles(
      [
        { id: "a", value: 100 },
        { id: "b", value: 25 },
        { id: "c", value: 4 },
      ],
      400,
      400
    );
    const a = packed.find((p) => p.id === "a");
    const b = packed.find((p) => p.id === "b");
    expect(a && b).toBeTruthy();
    expect(a!.r).toBeGreaterThan(b!.r);
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    expect(dist + 2).toBeGreaterThanOrEqual(a!.r + b!.r);
  });

  it("reads month change from price points", () => {
    const t0 = Date.parse("2026-08-19T00:00:00Z");
    const t1 = Date.parse("2026-09-19T00:00:00Z");
    expect(
      pctFromPoints(
        [
          { t: t0, price: 1 },
          { t: t1, price: 1.5 },
        ],
        30 * 86_400_000
      )
    ).toBeCloseTo(50);
  });
});

describe("winner board table helpers", () => {
  it("formats age and holders, and sorts by volume then gainers", () => {
    expect(fmtAge(Date.now() - 3 * 3600_000)).toBe("3h");
    expect(fmtAge(Date.now() - 4 * 86400_000)).toBe("4d");
    expect(fmtHolders(14300)).toBe("14.3K");
    expect(prettyTokenName("GEASY")).toBe("Geasy");
    const a = sample({ symbol: "AAA", volumeUsd: 1, mcapUsd: 9, holders: 2, firstSeenAt: 10 });
    const b = sample({ symbol: "BBB", volumeUsd: 8, mcapUsd: 3, holders: 9, firstSeenAt: 30, program: "easyflex", contract: "3asy" });
    const extras = new Map([
      [a.id, { id: a.id, change24: 1, changeWeek: 2, changeMonth: 3, spark: [] }],
      [b.id, { id: b.id, change24: 9, changeWeek: 1, changeMonth: 1, spark: [] }],
    ]);
    expect(sortBoardRows([a, b], "volume", "desc", extras).map((t) => t.symbol)).toEqual(["BBB", "AAA"]);
    expect(sortBoardRows([a, b], "gainers", "desc", extras).map((t) => t.symbol)).toEqual(["BBB", "AAA"]);
    expect(matchBoardQuery(a, "aa")).toBe(true);
    expect(matchBoardQuery(a, "zzz")).toBe(false);
    const filtered = applyBoardFilters([a, b], { ...EMPTY_BOARD_FILTERS, programs: ["easyflex"] }, extras);
    expect(filtered.map((t) => t.symbol)).toEqual(["BBB"]);
    const chips = boardFilterChips({ ...EMPTY_BOARD_FILTERS, mcapMin: "1000000" });
    expect(chips.some((c) => c.label.includes("Cap"))).toBe(true);
    expect(clearBoardChip({ ...EMPTY_BOARD_FILTERS, mcapMin: "1" }, "mcap").mcapMin).toBe("");
  });
});
