import { describe, expect, it } from "vitest";
import {
  CARD_DEFAULTS,
  HOLO_COLLECTION,
  HOLO_SCHEMA,
  IMAGE_SCHEMA,
  cardImmutable,
  mintPlan,
  usesPrintedFace,
} from "@/config/holoCards";

describe("holo cards", () => {
  it("mints with the image metadata fields", () => {
    const rows = cardImmutable(CARD_DEFAULTS, "QmCard", "https://flex.example/cards");
    const names = new Set(IMAGE_SCHEMA.map((field) => field.name));
    for (const row of rows) expect(names.has(row.key)).toBe(true);
    expect(rows.find((row) => row.key === "img")?.value).toEqual(["string", "QmCard"]);
    expect(rows.find((row) => row.key === "name")?.value).toEqual(["string", "EASY Ace"]);
    expect(rows.find((row) => row.key === "rarity")?.value).toEqual(["string", "Mythic"]);
    expect(rows.find((row) => row.key === "generative")?.value).toEqual(["uint8", 0]);
    expect(rows.find((row) => row.key === "nsfw")?.value).toEqual(["uint8", 0]);
    expect(rows.find((row) => row.key === "format")?.value).toEqual(["string", "Playing card"]);
    expect(rows.some((row) => row.key === "backimg")).toBe(false);
  });

  it("opens the collection and schema before the first mint", () => {
    const actions = mintPlan({
      issuer: "holo.fl3x",
      owner: "holo.fl3x",
      cid: "QmCard",
      pageUrl: "https://flex.example/cards",
      spec: CARD_DEFAULTS,
      needCollection: true,
      needSchema: true,
    });
    expect(actions.map((action) => action.name)).toEqual(["createcol", "createschema", "mintasset"]);
    expect(actions[0].data.collection_name).toBe(HOLO_COLLECTION);
    expect(actions[1].data.schema_name).toBe(HOLO_SCHEMA);
    expect(actions[1].data.schema_format).toEqual(IMAGE_SCHEMA);
    expect(actions[2].data.template_id).toBe(-1);
  });

  it("keeps the printed face until a setting moves", () => {
    expect(usesPrintedFace(CARD_DEFAULTS)).toBe(true);
    expect(usesPrintedFace({ ...CARD_DEFAULTS, pattern: "hex" })).toBe(false);
    expect(usesPrintedFace({ ...CARD_DEFAULTS, layers: { ...CARD_DEFAULTS.layers, edition: false } })).toBe(false);
  });
});
