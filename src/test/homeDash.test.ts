import { describe, expect, it } from "vitest";
import { volumeRead } from "@/services/homeDash";

describe("home volume", () => {
  it("keeps a partial sum when another token is still missing", () => {
    expect(volumeRead(120, 1, 0, true)).toEqual({ usd: 120, partial: true });
    expect(volumeRead(40, 0, 1, true)).toEqual({ usd: 40, partial: true });
  });

  it("does not show zero while the rest is still loading", () => {
    expect(volumeRead(0, 3, 0, true)).toEqual({ usd: null, partial: false });
    expect(volumeRead(0, 2, 0, false)).toEqual({ usd: null, partial: false });
  });

  it("shows a finished total, including a real zero", () => {
    expect(volumeRead(14, 0, 0, true)).toEqual({ usd: 14, partial: false });
    expect(volumeRead(0, 0, 0, true)).toEqual({ usd: 0, partial: false });
  });

  it("stays empty when every read failed", () => {
    expect(volumeRead(0, 0, 4, false)).toEqual({ usd: null, partial: false });
  });
});
