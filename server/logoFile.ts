import { lookup } from "node:dns/promises";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { validAccount, validSymbol } from "./accounts";

const MAX_BYTES = 1_048_576;
const CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,80})$/;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function logoRoot() {
  return path.resolve(process.cwd(), "public/tokens");
}

export function logoIdOk(contract: string, symbol: string, cid: string) {
  return validAccount(contract) && validSymbol(symbol) && CID.test(cid);
}

export function logoExt(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString() === "GIF87a" || bytes.subarray(0, 6).toString() === "GIF89a")) return "gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") return "webp";
  const head = bytes.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") && !bytes.subarray(0, 2048).toString("utf8").toLowerCase().includes("<script")) return "svg";
  return "";
}

function publicIp(ip: string) {
  if (ip.includes(":")) {
    const n = ip.toLowerCase();
    return n !== "::1" && !n.startsWith("fc") && !n.startsWith("fd") && !n.startsWith("fe80");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const a = p[0];
  const b = p[1];
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

async function urlOk(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return false;
  try {
    const ips = host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host) ? [{ address: host }] : await lookup(host, { all: true });
    return ips.length > 0 && ips.every((row) => publicIp(row.address));
  } catch {
    return false;
  }
}

export async function readLogoFile(root: string, contract: string, symbol: string, cid: string) {
  if (!logoIdOk(contract, symbol, cid)) return null;
  const dir = path.join(root, contract);
  for (const ext of Object.keys(TYPES)) {
    try {
      const body = await readFile(path.join(dir, `${symbol}-${cid}.${ext}`));
      return { body, type: TYPES[ext] };
    } catch {
      /* next extension */
    }
  }
  return null;
}

export function logoRemoteOk(url: string, contract: string, symbol: string, cid: string) {
  const alcor = `https://raw.githubusercontent.com/alcorexchange/alcor-ui/master/assets/tokens/proton/${symbol.toLowerCase()}_${contract}.png`;
  const drops = `https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/${symbol.toLowerCase()}-${contract}.png`;
  if (url === alcor || url === drops) return true;
  return Boolean(cid) && CID.test(cid) && url.includes(cid);
}

export async function writeLogoBytes(root: string, contract: string, symbol: string, cid: string, bytes: Buffer) {
  const ext = logoExt(bytes);
  if (!validAccount(contract) || !validSymbol(symbol) || (cid !== "" && !CID.test(cid)) || !ext || bytes.length > MAX_BYTES) return null;
  const dir = path.join(root, contract);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${symbol}.download`);
  await writeFile(tmp, bytes);
  await rename(tmp, path.join(dir, `${symbol}.${ext}`));
  if (cid) {
    const dest = path.join(dir, `${symbol}-${cid}.${ext}`);
    const cidTmp = path.join(dir, `.${symbol}-${cid}.download`);
    await writeFile(cidTmp, bytes);
    await rename(cidTmp, dest);
  }
  return { body: bytes, type: TYPES[ext], ext };
}

async function readPlainLogo(root: string, contract: string, symbol: string) {
  if (!validAccount(contract) || !validSymbol(symbol)) return null;
  const dir = path.join(root, contract);
  for (const ext of Object.keys(TYPES)) {
    try {
      const body = await readFile(path.join(dir, `${symbol}.${ext}`));
      return { body, type: TYPES[ext], ext };
    } catch {
      /* next extension */
    }
  }
  return null;
}

export async function fetchLogoFile(root: string, contract: string, symbol: string, cid: string, rawUrl: string) {
  if (!validAccount(contract) || !validSymbol(symbol) || (cid !== "" && !CID.test(cid))) return null;
  const plain = await readPlainLogo(root, contract, symbol);
  if (plain) return plain;
  const existing = cid ? await readLogoFile(root, contract, symbol, cid) : null;
  if (existing) return writeLogoBytes(root, contract, symbol, "", existing.body);
  const url = rawUrl.trim();
  if (!logoRemoteOk(url, contract, symbol, cid) || !(await urlOk(url))) return null;
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "FlexLauncher/1.0" } });
    if (!res.ok || !res.body || !logoRemoteOk(res.url, contract, symbol, cid) || !(await urlOk(res.url))) return null;
    const chunks: Buffer[] = [];
    let n = 0;
    const reader = res.body.getReader();
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      n += step.value.byteLength;
      if (n > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(step.value));
    }
    return writeLogoBytes(root, contract, symbol, cid, Buffer.concat(chunks));
  } catch {
    return null;
  }
}

export function formFields(body: Buffer, contentType: string) {
  const found = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const out: { fields: Record<string, string>; file?: Buffer } = { fields: {} };
  if (!found) return out;
  const boundary = `--${(found[1] || found[2]).trim()}`;
  for (const raw of body.toString("binary").split(boundary)) {
    if (!raw || raw === "--\r\n" || raw.startsWith("--")) continue;
    const sep = raw.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const headers = raw.slice(0, sep);
    const name = /name="([^"]+)"/i.exec(headers)?.[1];
    if (!name) continue;
    let payload = raw.slice(sep + 4);
    if (payload.endsWith("\r\n")) payload = payload.slice(0, -2);
    if (/filename="/i.test(headers)) out.file = Buffer.from(payload, "binary");
    else out.fields[name] = Buffer.from(payload, "binary").toString("utf8");
  }
  return out;
}

export async function publishLogo(token: string, contract: string, symbol: string, bytes: Buffer, ext: string) {
  if (!token || !validAccount(contract) || !validSymbol(symbol) || !TYPES[ext]) return;
  const markDir = path.resolve(process.cwd(), "data/logo-sync", contract);
  const mark = path.join(markDir, symbol);
  try {
    await readFile(mark);
    return;
  } catch {
    /* not published yet */
  }
  const filePath = `public/tokens/${contract}/${symbol}.${ext}`;
  const content = bytes.toString("base64");
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "flex-launcher",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  try {
    const got = await fetch(`https://api.github.com/repos/dougbutner/Flex-Launcher-UI/contents/${filePath}?ref=main`, { headers });
    let sha = "";
    if (got.ok) {
      const json = (await got.json()) as { sha?: string; content?: string };
      if (String(json.content || "").replace(/\n/g, "") === content) {
        await mkdir(markDir, { recursive: true });
        await writeFile(mark, "");
        return;
      }
      sha = json.sha || "";
    } else if (got.status !== 404) return;
    const put = await fetch(`https://api.github.com/repos/dougbutner/Flex-Launcher-UI/contents/${filePath}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Add ${symbol} logo`,
        content,
        branch: "main",
        ...(sha ? { sha } : {}),
      }),
    });
    if (!put.ok) return;
    await mkdir(markDir, { recursive: true });
    await writeFile(mark, "");
  } catch {
    /* quiet */
  }
}

export async function serveLogo(pathname: string, rawUrl: string, root = logoRoot()) {
  const m = /^\/api\/logo\/([a-z1-5.]{1,12})\/([A-Za-z]{1,7})-([A-Za-z0-9]+)$/.exec(pathname);
  if (!m) return null;
  const contract = m[1].toLowerCase();
  const symbol = m[2].toUpperCase();
  const cid = m[3];
  if (!logoIdOk(contract, symbol, cid)) return null;
  return (await readLogoFile(root, contract, symbol, cid)) || (await fetchLogoFile(root, contract, symbol, cid, rawUrl));
}
