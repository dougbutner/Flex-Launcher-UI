import { describe, expect, it } from "vitest";
import { planFromDraft, quoteFromDraft } from "@/components/launch/draftPlan";
import { WRAP_ALCOR } from "@/config/launch";
import {
  HOLO_FEES,
  HOLO_TOKENS,
  holoBandFromTicks,
  holoDraft,
  holoPriceBand,
  holoReflectionSplit,
  holoSchedule,
} from "@/config/holoLaunch";
import { insidersStepValid } from "@/services/insidersClub";
import { taxCreateValid } from "@/services/taxRates";

describe("holo releases", () => {
  it("walks Wednesdays from 28 Oct 2026 with a 30 day public sale", () => {
    expect(HOLO_TOKENS.map((t) => t.symbol)).toEqual([
      "HOLOXPR",
      "HOLOUSD",
      "HOLOBTC",
      "HOLOETH",
      "HOLOXRP",
      "HEASY",
      "HOLOSOL",
      "HGRAMS",
      "HDOGE",
      "HOLOXLM",
      "HOLOLTC",
      "HHBAR",
      "HOLOXMT",
      "HOLOXDC",
      "HPAXG",
    ]);
    expect(new Date(2026, 9, 28).getDay()).toBe(3);
    expect(holoSchedule(0)).toEqual({ insider: "2026-10-28T00:00:00", launch: "2026-11-27T00:00:00" });
    expect(holoSchedule(1).insider).toBe("2026-11-04T00:00:00");
    expect(holoSchedule(14).insider).toBe("2027-02-03T00:00:00");
    for (let i = 0; i < HOLO_TOKENS.length; i++) {
      const day = new Date(holoSchedule(i).insider).getDay();
      expect(day).toBe(3);
    }
  });

  it("backs HOLOUSD with wrapped USDC", () => {
    const usd = HOLO_TOKENS.find((t) => t.symbol === "HOLOUSD");
    expect(usd?.quoteSymbol).toBe("USDC");
    expect(usd?.quoteContract).toBe(WRAP_ALCOR);
    expect(usd?.quoteId).toBe("wrap");
    const draft = holoDraft({
      token: usd!,
      fees: HOLO_FEES,
      insider: holoSchedule(1).insider,
      launch: holoSchedule(1).launch,
      quoteUsd: 1,
      proofPoolId: "11708",
      logoUrl: usd!.logo,
    });
    expect(quoteFromDraft(draft)).toMatchObject({ symbol: "USDC", contract: WRAP_ALCOR, precision: 6 });
    expect(planFromDraft(draft)?.quote.contract).toBe(WRAP_ALCOR);
  });

  it("splits 1.9% reflection into 1.5% holders and 0.2% channels", () => {
    expect(holoReflectionSplit(HOLO_FEES)).toEqual({
      reflectionRate: 190,
      angelNumbersBps: 1053,
      jackpotBps: 1053,
    });
    expect(
      taxCreateValid(
        {
          reflectionRate: 190,
          burnRate: 0,
          projectRate: 10,
          projectAccount: "holo.fl3x",
          angelNumbersBps: 1053,
          jackpotBps: 1053,
        },
        "flexforex"
      )
    ).toBeNull();
  });

  it("prices a token from $1 to $10,000 of the backing token", () => {
    const easy = HOLO_TOKENS.find((t) => t.symbol === "HEASY");
    expect(easy).toBeTruthy();
    const quoteUsd = 0.05;
    expect(holoPriceBand(quoteUsd)).toEqual({ priceLower: "20", priceUpper: "200000" });
    const times = holoSchedule(5);
    const draft = holoDraft({
      token: easy!,
      fees: HOLO_FEES,
      insider: times.insider,
      launch: times.launch,
      quoteUsd,
      proofPoolId: "0",
      logoUrl: "https://example.com/easy.png",
    });
    expect(draft.program).toBe("flexforex");
    expect(draft.maxSupply).toBe("10000");
    expect(draft.precision).toBe(6);
    expect(draft.swapUnderlyingDefault).toBe(true);
    expect(draft.fee).toBe(10000);
    expect(draft.lockDays).toBe(1080);
    expect(draft.presaleEnabled).toBe(true);
    expect(draft.presaleInsiderBps).toBe(10);
    expect(draft.presaleLockedInsiderBps).toBe(100);
    expect(draft.presaleInviteList).toBe("");
    expect(draft.projectAccount).toBe("holo.fl3x");
    expect(insidersStepValid(draft)).toBeNull();
    const plan = planFromDraft(draft);
    expect(plan).toBeTruthy();
    const lo = Math.min(plan!.quotePerTokenLower, plan!.quotePerTokenUpper) * quoteUsd;
    const hi = Math.max(plan!.quotePerTokenLower, plan!.quotePerTokenUpper) * quoteUsd;
    expect(lo).toBeGreaterThan(0.9);
    expect(lo).toBeLessThan(1.1);
    expect(hi).toBeGreaterThan(9000);
    expect(hi).toBeLessThan(11000);
    const again = holoBandFromTicks({
      symbol: draft.symbol,
      quote: plan!.quote,
      fee: plan!.fee,
      tickLower: plan!.tickLower,
      tickUpper: plan!.tickUpper,
    });
    const replay = planFromDraft({ ...draft, ...again, fee: again!.fee, priceLower: again!.priceLower, priceUpper: again!.priceUpper });
    expect(replay?.tickLower).toBe(plan!.tickLower);
    expect(replay?.tickUpper).toBe(plan!.tickUpper);
  });
});
