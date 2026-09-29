import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/hooks/useLaunchDraft";
import {
  clubMarkOf,
  clubSignActions,
  actorClubMark,
  insidersStepValid,
  localToUnix,
  parseInviteAccounts,
  presaleAdjustError,
  presaleAdjustState,
  unixToLocal,
  type PresaleAdjust,
} from "@/services/insidersClub";

describe("insidersClub", () => {
  it("round-trips unix through local time and accepts a raw timestamp", () => {
    const unix = 1_800_000_000;
    expect(localToUnix(unixToLocal(unix))).toBe(unix);
    expect(localToUnix(String(unix))).toBe(unix);
    expect(localToUnix("")).toBe(0);
  });

  it("parses invite names and skips dupes", () => {
    expect(parseInviteAccounts("Alice, bob bob\ncarol")).toEqual(["alice", "bob", "carol"]);
    expect(parseInviteAccounts("")).toEqual([]);
  });

  it("skips validation when the club is off", () => {
    expect(insidersStepValid(emptyDraft())).toBeNull();
  });

  it("requires buys after club open and a valid invite list", () => {
    const base = {
      ...emptyDraft(),
      presaleEnabled: true,
      presaleInsiderTime: "2026-09-20T12:00",
      presaleLaunchTime: "2026-09-27T12:00",
      presaleInsiderBps: 100,
    };
    expect(insidersStepValid(base)).toBeNull();
    expect(insidersStepValid({ ...base, presaleLaunchTime: "2026-09-19T12:00" })).toMatch(/Public launch/);
    expect(insidersStepValid({ ...base, presaleInviteList: "not a name!!" })).toMatch(/Bad account/);
    expect(insidersStepValid({ ...base, presaleLockSecs: 89 * 86400 })).toMatch(/91-day/);
    expect(insidersStepValid({ ...base, presaleLockedInsiderBps: 250 })).toMatch(/Insider LP lock days/);
    expect(insidersStepValid({ ...base, presaleLockedInsiderBps: 50 })).toMatch(/Insider Max/);
  });

  it("keeps setpresale open until launched, and blocks a late first row", () => {
    expect(presaleAdjustState(false, false)).toBe("open");
    expect(presaleAdjustState(false, true)).toBe("open");
    expect(presaleAdjustState(true, true)).toBe("sealed");
    expect(presaleAdjustState(true, false)).toBe("missed");
  });

  it("allows earlier times on setpresale while the row is writable", () => {
    const form: PresaleAdjust = {
      insiderTime: "2020-01-01T00:00:00",
      launchTime: "2020-01-02T00:00:00",
      mode: 0,
      insiderBps: 100,
      lockedInsiderBps: 0,
      collection: "",
      schema: "",
      nftMin: 0,
      minTokenQty: "",
      minTokenContract: "",
      lpMin: 0,
      lockSecs: 0,
      lockedLpMin: 0,
      needKyc: false,
      gatesAll: false,
      inviteList: "",
    };
    expect(presaleAdjustError(form)).toBeNull();
    expect(presaleAdjustError({ ...form, launchTime: "2020-01-01T00:00:00" })).toMatch(/Public launch/);
    expect(presaleAdjustError({ ...form, lockedInsiderBps: 50 })).toMatch(/Insider Max/);
    expect(presaleAdjustError({ ...form, lockSecs: 89 * 86400 })).toMatch(/91-day/);
    expect(presaleAdjustError({ ...form, lockedLpMin: 10, lockSecs: 0 })).toBeNull();
  });

  it("builds setpresale then addinsiders", () => {
    const draft = {
      ...emptyDraft(),
      presaleEnabled: true,
      presaleInsiderTime: "2026-09-20T12:00",
      presaleLaunchTime: "2026-09-27T12:00",
      presaleInsiderBps: 100,
      presaleInviteList: "alice, bob",
    };
    const actions = clubSignActions("3asy", "FOO", draft);
    expect(actions.map((a) => a.name)).toEqual(["setpresale", "addinsiders"]);
    expect(actions[0].data.mode).toBe(1);
    expect(clubSignActions("3asy", "FOO", { ...draft, presaleMode: 0 })[0].data.mode).toBe(1);
    expect(actions[1].data.accounts).toBe("alice,bob");
  });

  it("marks approved insiders, and proven after lock proof", () => {
    expect(clubMarkOf(null)).toBeNull();
    expect(clubMarkOf({ approved: false, locked_pos: 9 })).toBeNull();
    expect(clubMarkOf({ approved: true, locked_pos: 0 })).toBe("insider");
    expect(clubMarkOf({ approved: true, locked_pos: 42 })).toBe("proven");
  });

  it("finds an insider row by account", () => {
    const rows = [
      { account: "bob", approved: true, locked_pos: 0 },
      { account: "alice", approved: true, locked_pos: 7 },
    ];
    expect(actorClubMark(rows, "ALICE")).toBe("proven");
    expect(actorClubMark(rows, "nobody")).toBeNull();
  });
});
