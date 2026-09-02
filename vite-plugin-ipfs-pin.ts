import type { IncomingMessage, ServerResponse } from "http";
import type { Plugin } from "vite";

const MAX_BYTES = 1_048_576;
const MAX_BODY = MAX_BYTES + 64_000;
const ALLOWED = new Set(["image/png", "image/svg+xml"]);

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, cap: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > cap) throw new Error("File too large (max 1 MB).");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function parseFilePart(body: Buffer, contentType: string): { bytes: Buffer; filename: string; type: string } {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new Error("Expected multipart/form-data with a file field.");
  const boundary = `--${(m[1] || m[2]).trim()}`;
  const rawParts = body.toString("binary").split(boundary);
  for (const raw of rawParts) {
    if (!raw || raw === "--\r\n" || raw.startsWith("--")) continue;
    const sep = raw.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const headers = raw.slice(0, sep);
    if (!/name="file"/i.test(headers)) continue;
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1] || "logo.png";
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "";
    let payload = raw.slice(sep + 4);
    if (payload.endsWith("\r\n")) payload = payload.slice(0, -2);
    const bytes = Buffer.from(payload, "binary");
    return { bytes, filename, type };
  }
  throw new Error('Missing multipart field "file".');
}

async function handlePin(req: IncomingMessage, res: ServerResponse, jwt: string, gateway: string) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "POST an image file." });
    return;
  }
  const ct = String(req.headers["content-type"] || "");
  if (!ct.includes("multipart/form-data")) {
    send(res, 400, { error: "Send multipart/form-data with field file." });
    return;
  }
  try {
    const body = await readBody(req, MAX_BODY);
    const file = parseFilePart(body, ct);
    if (!file.bytes.length) throw new Error("Empty file.");
    if (file.bytes.length > MAX_BYTES) throw new Error("File too large (max 1 MB).");
    const type = file.type.toLowerCase();
    if (!ALLOWED.has(type)) throw new Error("Use a square PNG or SVG.");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.bytes)], { type }), file.filename);
    const pin = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    const json = (await pin.json()) as { IpfsHash?: string; error?: string | { details?: string } };
    if (!pin.ok || !json.IpfsHash) {
      const err = json.error;
      const msg =
        (typeof err === "object" && err?.details) || (typeof err === "string" && err) || `Pinata ${pin.status}`;
      send(res, 502, { error: String(msg) });
      return;
    }
    const host = gateway.replace(/^https?:\/\//, "").replace(/\/$/, "");
    send(res, 200, { cid: json.IpfsHash, url: `https://${host}/ipfs/${json.IpfsHash}` });
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
}

export function ipfsPinPlugin(env: Record<string, string>): Plugin {
  const jwt = env.PINATA_JWT?.trim() || "";
  const gateway = env.PINATA_GATEWAY?.trim() || "gateway.pinata.cloud";

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/api/ipfs/pin") {
      next();
      return;
    }
    if (!jwt) {
      send(res, 503, { error: "PINATA_JWT is not set on the server." });
      return;
    }
    void handlePin(req, res, jwt, gateway);
  };

  return {
    name: "ipfs-pin",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
