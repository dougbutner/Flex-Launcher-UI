import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/hooks/useLaunchDraft";
import {
  clubMarkOf,
  clubSignActions,
  insidersStepValid,
  parseInviteAccounts,
} from "@/services/insidersClub";

describe("insidersClub", () => {
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
    expect(insidersStepValid({ ...base, presaleLockSecs: 88 * 86400 })).toMatch(/90d/);
    expect(insidersStepValid({ ...base, presaleLockedInsiderBps: 250 })).toMatch(/Insider LP lock days/);
    expect(insidersStepValid({ ...base, presaleLockedInsiderBps: 50 })).toMatch(/Insider Max/);
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
    expect(actions[0].data.need_kyc).toBe(false);
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
});
