import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "src/entry/cacheRefresh.ts")],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  mainFields: ["browser", "module", "main"],
  conditions: ["browser", "import", "module", "default"],
  outfile: path.join(root, "functions/generated/cacheRefresh.js"),
  alias: { "@": path.join(root, "src") },
  logLevel: "warning",
});
