import { describe, expect, it } from "vitest";
import { MOCK_SPECS, MOCK_TOKENS, unixMs } from "@/test/sandbox/data";
import { mergeBoard, mergeFeed, mergeLaunch, mergeLaunches } from "@/test/sandbox/overlay";

describe("site sandbox mock snapshot", () => {
  it("stores ten launches with the requested month mix", () => {
    expect(MOCK_SPECS).toHaveLength(10);
    expect(MOCK_TOKENS).toHaveLength(10);
    const buckets = { past: 0, current: 0, next: 0, following: 0 };
    for (const spec of MOCK_SPECS) {
      const d = new Date(unixMs(spec.launchAt));
      const ym = d.getUTCFullYear() * 12 + d.getUTCMonth();
      const cur = 2026 * 12 + 8;
      if (ym < cur) buckets.past += 1;
      else if (ym === cur) buckets.current += 1;
      else if (ym === cur + 1) buckets.next += 1;
      else if (ym === cur + 2) buckets.following += 1;
    }
    expect(buckets).toEqual({ past: 2, current: 4, next: 2, following: 2 });
  });

  it("keeps live rows and only fills missing mock tokens", () => {
    const liveLaunch = { token_symbol: "AURORA", launched: true };
    expect(mergeLaunch("for3x", "AURORA", liveLaunch)).toBe(liveLaunch);
    expect(mergeLaunch("for3x", "AURORA", null)?.token_symbol).toBe("AURORA");
    const liveList = [{ token_symbol: "REALONE" }];
    const merged = mergeLaunches("for3x", liveList);
    expect(merged[0]).toBe(liveList[0]);
    expect(merged.some((row) => row.token_symbol === "AURORA")).toBe(true);
    expect(merged.some((row) => row.token_symbol === "PEBBLE")).toBe(false);
  });

  it("adds board rows and room chat without replacing live posts", () => {
    const liveBoard = [
      {
        id: "for3x:AURORA",
        program: "flexforex" as const,
        contract: "for3x",
        symbol: "AURORA",
        quoteSymbol: "EASY",
        quoteContract: "mon3y",
        poolId: 1,
        firstSeenAt: 1,
        mcapUsd: 9,
        liqUsd: 1,
        backingUsd: 0.4,
        volumeUsd: 1,
        holders: 1,
      },
    ];
    const board = mergeBoard(liveBoard);
    expect(board[0]).toBe(liveBoard[0]);
    expect(board.some((t) => t.symbol === "PEBBLE")).toBe(true);

    const livePost = {
      id: 1,
      contract: "for3x",
      symbol: "AURORA",
      author: "alice",
      body: "live $AURORA",
      parentId: null,
      createdAt: Date.parse("2026-09-19T18:00:00Z"),
      authorScore: 1,
      giphyUrl: "",
      replyCount: 0,
      upCount: 0,
      upEasy: 0,
    };
    const feed = mergeFeed(
      { posts: [livePost], activity: { alice: 1 }, upsEasy: {}, range: "all" },
      "for3x",
      "AURORA",
      { range: "all" }
    );
    expect(feed.posts.some((p) => p.id === 1)).toBe(true);
    expect(feed.posts.some((p) => p.author === "goldhands")).toBe(true);
  });
});
