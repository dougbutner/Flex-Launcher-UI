import { describe, expect, it } from "vitest";
import {
  appendSymbolTag,
  BODY_STORED_MAX,
  BODY_USER_MAX,
  canTopLevelPost,
  easyQuantity,
  effectiveAuthorScore,
  parseFeedRange,
  rangeSince,
  upDeltaForClick,
  utcDayStart,
  validGiphyUrl,
  validTxId,
} from "@/services/insidersRules";

describe("insidersRules", () => {
  it("appends $SYMBOL and keeps user text at 480, stored at 500", () => {
    expect(appendSymbolTag("hello", "FOO")).toBe("hello $FOO");
    expect(appendSymbolTag("hello $FOO", "FOO")).toBe("hello $FOO");
    const long = "x".repeat(500);
    const out = appendSymbolTag(long, "GEASY");
    expect(out.endsWith(" $GEASY")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(BODY_STORED_MAX);
    expect(out.length - " $GEASY".length).toBe(BODY_USER_MAX);
  });

  it("maps range windows", () => {
    const now = Date.UTC(2026, 8, 17, 15, 0, 0);
    expect(parseFeedRange("week")).toBe("week");
    expect(parseFeedRange("nope")).toBe("day");
    expect(rangeSince("all", now)).toBe(0);
    expect(rangeSince("day", now)).toBe(utcDayStart(now));
    expect(rangeSince("week", now)).toBe(now - 7 * 86_400_000);
    expect(rangeSince("month", now)).toBe(now - 30 * 86_400_000);
    expect(rangeSince("year", now)).toBe(now - 365 * 86_400_000);
    expect(utcDayStart(now)).toBe(Date.UTC(2026, 8, 17));
  });

  it("steps UP +1 then +5 then +10", () => {
    expect([1, 2, 3].map(upDeltaForClick)).toEqual([1, 1, 1]);
    expect(upDeltaForClick(4)).toBe(5);
    expect(upDeltaForClick(13)).toBe(5);
    expect(upDeltaForClick(14)).toBe(10);
    expect(easyQuantity(3)).toBe("3.000000 EASY");
  });

  it("allows one top-level post per UTC day", () => {
    expect(canTopLevelPost(0)).toBe(true);
    expect(canTopLevelPost(1)).toBe(false);
  });

  it("caps ranking score with 24h UP EASY", () => {
    expect(effectiveAuthorScore(89, 10)).toBe(99);
    expect(effectiveAuthorScore(96, 20)).toBe(100);
  });

  it("accepts giphy https urls and 64-char tx ids", () => {
    expect(validGiphyUrl("https://media.giphy.com/media/abc/giphy.gif")).toBe(true);
    expect(validGiphyUrl("http://media.giphy.com/media/abc/giphy.gif")).toBe(false);
    expect(validTxId("a".repeat(64))).toBe(true);
    expect(validTxId("zz")).toBe(false);
  });
});
