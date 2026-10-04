import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { logoExt, readLogoFile, serveLogo, writeLogoBytes } from "../../server/logoFile";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const cid = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const other = "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7fKqP1";
let dir = "";

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = "";
});

describe("logo files", () => {
  it("saves SYMBOL-hash and will not serve another hash or a bare symbol", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "flex-logos-"));
    expect(logoExt(png)).toBe("png");
    expect(logoExt(Buffer.from("nope"))).toBe("");
    const saved = await writeLogoBytes(dir, "fl3x", "GEASY", cid, png);
    expect(saved?.type).toBe("image/png");
    expect(await readFile(path.join(dir, "fl3x", `GEASY-${cid}.png`))).toEqual(png);
    expect((await readLogoFile(dir, "fl3x", "GEASY", cid))?.body.equals(png)).toBe(true);
    expect(await readLogoFile(dir, "fl3x", "GEASY", other)).toBeNull();
    expect(await serveLogo(`/api/logo/fl3x/GEASY-${cid}`, "https://example.invalid/nope.png", dir)).toMatchObject({
      type: "image/png",
    });
    expect(await serveLogo("/api/logo/fl3x/GEASY", `https://example.com/${cid}.png`, dir)).toBeNull();
    expect(await serveLogo(`/api/logo/fl3x/XPR-${cid}`, "https://example.com/xpr.png", dir)).toBeNull();
  });

  it("refuses a logo path that is not a contract and symbol", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "flex-logos-"));
    expect(await serveLogo(`/api/logo/not a contract/ZZZ-${cid}`, "", dir)).toBeNull();
    expect(await serveLogo("/api/logo/fl3x/ZZZ", "", dir)).toBeNull();
  });
});
