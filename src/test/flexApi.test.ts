import { describe, expect, it } from "vitest";
import { joinFlexApi } from "@/services/flexApi";

describe("flex API origin", () => {
  it("joins the Namecheap host and keeps same-origin paths empty", () => {
    expect(joinFlexApi("https://api.flex.forex", "/api/site")).toBe("https://api.flex.forex/api/site");
    expect(joinFlexApi("https://api.flex.forex/", "/api/cache", "key=board:tokens")).toBe(
      "https://api.flex.forex/api/cache?key=board:tokens"
    );
    expect(joinFlexApi("", "/api/manager")).toBe("/api/manager");
  });
});
