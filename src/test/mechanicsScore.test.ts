import { describe, expect, it } from "vitest";
import {
  activityScore,
  holdScoreFromRank,
  lpScoreFromShare,
  mechanicsTotal,
  rankHolders,
  scoreParts,
} from "@/services/mechanicsScore";

describe("mechanicsScore", () => {
  it("gives top 100 holders 0.5 per rank from #1, max 50", () => {
    expect(holdScoreFromRank(1)).toBe(50);
    expect(holdScoreFromRank(2)).toBe(49.5);
    expect(holdScoreFromRank(100)).toBe(0.5);
    expect(holdScoreFromRank(101)).toBe(0);
    expect(holdScoreFromRank(0)).toBe(0);
  });

  it("ranks by raw balance then name", () => {
    const ranks = rankHolders([
      { owner: "bob", raw: 10 },
      { owner: "alice", raw: 50 },
      { owner: "cara", raw: 50 },
      { owner: "zero", raw: 0 },
    ]);
    expect(ranks.get("alice")).toBe(1);
    expect(ranks.get("cara")).toBe(2);
    expect(ranks.get("bob")).toBe(3);
    expect(ranks.has("zero")).toBe(false);
  });

  it("scores main-pool LP as a share of 30", () => {
    expect(lpScoreFromShare(50, 100)).toBe(15);
    expect(lpScoreFromShare(100, 100)).toBe(30);
    expect(lpScoreFromShare(0, 100)).toBe(0);
    expect(lpScoreFromShare(10, 0)).toBe(0);
  });

  it("caps 24h messages plus token txs and UP EASY at 20", () => {
    expect(activityScore(1, 2)).toBe(3);
    expect(activityScore(12, 12)).toBe(20);
    expect(activityScore(-1, 4)).toBe(4);
    expect(activityScore(1, 1, 5)).toBe(7);
    expect(activityScore(10, 10, 10)).toBe(20);
  });

  it("rounds the 100-point total", () => {
    expect(mechanicsTotal(49.5, 15, 3)).toBe(68);
    const parts = scoreParts({ rank: 1, userLiq: 10, totalLiq: 10, messages24h: 1, txs24h: 1 });
    expect(parts.total).toBe(82);
    expect(parts.hold).toBe(50);
    expect(parts.lp).toBe(30);
    expect(parts.activity).toBe(2);
  });
});
