import { describe, expect, it } from "vitest";
import {
  clubDateEvents,
  dayKey,
  eventKindLabel,
  eventsByDay,
  monthEvents,
  unixToMs,
  type CalEvent,
} from "@/services/launchEvents";

function ev(partial: Partial<CalEvent> & Pick<CalEvent, "id" | "kind" | "at">): CalEvent {
  return {
    contract: "for3x",
    symbol: "FOO",
    program: "flexforex",
    quoteSymbol: "EASY",
    quoteContract: "mon3y",
    poolId: 1,
    ...partial,
  };
}

describe("launchEvents calendar", () => {
  it("converts unix seconds and leaves millis", () => {
    expect(unixToMs(0)).toBe(0);
    expect(unixToMs(1_758_326_400)).toBe(1_758_326_400_000);
    expect(unixToMs(1_758_326_400_000)).toBe(1_758_326_400_000);
  });

  it("groups local days and keeps club dates in order", () => {
    const presaleAt = new Date(2026, 8, 20, 12, 0, 0).getTime();
    const launchAt = new Date(2026, 8, 27, 9, 0, 0).getTime();
    const unlockAt = new Date(2026, 8, 27, 18, 0, 0).getTime();
    const list = [
      ev({ id: "u", kind: "unlock", at: unlockAt, symbol: "BAR" }),
      ev({ id: "l", kind: "launch", at: launchAt }),
      ev({ id: "p", kind: "presale", at: presaleAt }),
    ];
    const byDay = eventsByDay(list);
    expect(dayKey(presaleAt)).toBe("2026-09-20");
    expect(byDay.get("2026-09-20")?.map((e) => e.id)).toEqual(["p"]);
    expect(byDay.get("2026-09-27")?.map((e) => e.id)).toEqual(["l", "u"]);
    expect(clubDateEvents(list).map((e) => e.id)).toEqual(["p", "l"]);
    expect(monthEvents(list, 2026, 8).map((e) => e.id)).toEqual(["p", "l", "u"]);
    expect(monthEvents(list, 2026, 7)).toEqual([]);
    expect(eventKindLabel("presale")).toBe("Insiders");
    expect(eventKindLabel("launch")).toBe("Launch");
  });
});
