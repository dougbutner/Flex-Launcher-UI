import fs from "fs";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import type { Connect, Plugin } from "vite";

const ROOT = path.resolve("holoflx/out/v8");
const TOKEN = /^(EASY|MEME|WON|BTC)$/;
const FOIL = /^(diamond|gold|rose-gold|rose-silver)$/;
const RANK = /^(A|K|Q|J|10|[2-9])$/;

function sendFile(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
  const url = (req.url || "").split("?")[0];
  const match = /^\/holo-cards\/([^/]+)\/([^/]+)\/([^/]+)\.png$/.exec(url);
  if (!match) {
    next();
    return;
  }
  const token = match[1];
  const foil = match[2];
  const rank = match[3];
  if (!TOKEN.test(token) || !FOIL.test(foil) || !RANK.test(rank)) {
    next();
    return;
  }
  const file = path.resolve(ROOT, token, foil, `${rank}.png`);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) {
    next();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  fs.createReadStream(file).pipe(res);
}

function attach(server: { middlewares: Connect.Server }) {
  server.middlewares.use(sendFile);
}

/** Serves the local printed faces. The folder stays out of git. */
export function holoCardsPlugin(): Plugin {
  return {
    name: "holo-cards",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
