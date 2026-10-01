import { describe, expect, it } from "vitest";
import { joinFlexApi, pagesPhpPath } from "@/services/flexApi";

describe("flex API origin", () => {
  it("joins the Namecheap host and keeps same-origin paths empty", () => {
    expect(joinFlexApi("https://api.flex.forex", "/api/site")).toBe("https://api.flex.forex/site");
    expect(joinFlexApi("https://api.flex.forex/", "/api/cache", "key=board:tokens")).toBe(
      "https://api.flex.forex/cache?key=board:tokens"
    );
    expect(joinFlexApi("", "/api/manager")).toBe("/api/manager");
    expect(pagesPhpPath("/api/site")).toBe("/php/site");
    expect(pagesPhpPath("/api/insiders/feed")).toBe("/php/insiders/feed");
  });
});
