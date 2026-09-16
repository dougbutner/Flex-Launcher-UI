import type { IncomingMessage, ServerResponse } from "http";
import type { Plugin } from "vite";

const API = "https://api.github.com";
const MAX_PNG = 400_000;

type Target = "alcor-ui" | "eos-airdrops";

type RepoSpec = {
  upstreamOwner: string;
  upstreamRepo: string;
  forkOwner: string;
  defaultBranch: string;
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, cap: number): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > cap) throw new Error("Body too large.");
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function spec(target: Target, login: string): RepoSpec {
  if (target === "alcor-ui") {
    return { upstreamOwner: "alcorexchange", upstreamRepo: "alcor-ui", forkOwner: login, defaultBranch: "master" };
  }
  return { upstreamOwner: "eoscafe", upstreamRepo: "eos-airdrops", forkOwner: login, defaultBranch: "master" };
}

function branchName(symbol: string, contract: string) {
  return `flex-listing-${symbol.trim().toLowerCase()}-${contract.trim().toLowerCase().replace(/\./g, "-")}`;
}

function alcorFile(symbol: string, contract: string) {
  return `assets/tokens/proton/${symbol.trim().toLowerCase()}_${contract.trim().toLowerCase()}.png`;
}

function airdropsFile(symbol: string, contract: string) {
  return `logos/${symbol.trim().toLowerCase()}-${contract.trim().toLowerCase()}.png`;
}

async function gh(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { message: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function mergeUpstream(token: string, repo: RepoSpec) {
  const r = await gh(token, "POST", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/merge-upstream`, {
    branch: repo.defaultBranch,
  });
  if (r.status === 409) throw new Error(`Fork ${repo.forkOwner}/${repo.upstreamRepo} has a conflict with upstream. Sync it on GitHub, then try again.`);
  if (!r.ok && r.status !== 422) {
    throw new Error(String(r.json.message || `Could not sync ${repo.forkOwner}/${repo.upstreamRepo} (${r.status}).`));
  }
  return String(r.json.merge_type || r.json.message || "synced");
}

async function putFile(
  token: string,
  repo: RepoSpec,
  branch: string,
  path: string,
  contentB64: string,
  message: string
) {
  const existing = await gh(
    token,
    "GET",
    `/repos/${repo.forkOwner}/${repo.upstreamRepo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`
  );
  const sha = typeof existing.json.sha === "string" ? existing.json.sha : undefined;
  const put = await gh(token, "PUT", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/contents/${path}`, {
    message,
    content: contentB64,
    branch,
    sha,
  });
  if (!put.ok) throw new Error(String(put.json.message || `Could not write ${path}.`));
}

async function ensureBranch(token: string, repo: RepoSpec, branch: string) {
  const base = await gh(token, "GET", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/git/ref/heads/${repo.defaultBranch}`);
  const sha = (base.json.object as { sha?: string } | undefined)?.sha;
  if (!sha) throw new Error(`Missing ${repo.defaultBranch} on ${repo.forkOwner}/${repo.upstreamRepo}.`);
  const existing = await gh(token, "GET", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/git/ref/heads/${branch}`);
  if (existing.ok) {
    await gh(token, "POST", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/merges`, {
      base: branch,
      head: repo.defaultBranch,
    });
    return;
  }
  const created = await gh(token, "POST", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha,
  });
  if (!created.ok) throw new Error(String(created.json.message || `Could not create branch ${branch}.`));
}

async function findOrOpenPr(token: string, repo: RepoSpec, branch: string, title: string, body: string) {
  const head = `${repo.forkOwner}:${branch}`;
  const listed = await gh(
    token,
    "GET",
    `/repos/${repo.upstreamOwner}/${repo.upstreamRepo}/pulls?head=${encodeURIComponent(head)}&state=all&per_page=5`
  );
  const rows = Array.isArray(listed.json) ? listed.json : [];
  const open = rows.find((r) => (r as { state?: string }).state === "open") as
    | { html_url?: string; number?: number; state?: string; merged_at?: string }
    | undefined;
  const any = (open || rows[0]) as { html_url?: string; number?: number; state?: string; merged_at?: string } | undefined;
  if (open?.html_url) {
    return { url: open.html_url, number: open.number, state: "open", already: true };
  }
  const created = await gh(token, "POST", `/repos/${repo.upstreamOwner}/${repo.upstreamRepo}/pulls`, {
    title,
    body,
    head,
    base: repo.defaultBranch,
  });
  if (!created.ok) {
    const msg = String(created.json.message || "");
    if (created.status === 422 && any?.html_url) {
      return {
        url: any.html_url,
        number: any.number,
        state: any.merged_at ? "merged" : any.state || "closed",
        already: true,
      };
    }
    throw new Error(msg || "Could not open the pull request.");
  }
  return {
    url: String(created.json.html_url || ""),
    number: Number(created.json.number || 0),
    state: "open",
    already: false,
  };
}

async function fileContent(token: string, repo: RepoSpec, branch: string, path: string): Promise<{ text: string; sha?: string }> {
  const got = await gh(
    token,
    "GET",
    `/repos/${repo.forkOwner}/${repo.upstreamRepo}/contents/${path}?ref=${encodeURIComponent(branch)}`
  );
  if (!got.ok || typeof got.json.content !== "string") throw new Error(`Missing ${path} on the fork.`);
  const text = Buffer.from(String(got.json.content).replace(/\n/g, ""), "base64").toString("utf8");
  return { text, sha: typeof got.json.sha === "string" ? got.json.sha : undefined };
}

async function pngBytes(iconurl: string, pngBase64?: string): Promise<string> {
  if (pngBase64 && pngBase64.length < MAX_PNG * 2) return pngBase64.replace(/^data:image\/png;base64,/, "");
  if (!iconurl) throw new Error("Need an icon URL or a PNG.");
  const res = await fetch(iconurl);
  if (!res.ok) throw new Error(`Could not download the logo (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PNG) throw new Error("Logo is too large to commit (max 400 KB).");
  return buf.toString("base64");
}

function upsertAirdrop(tokens: unknown[], entry: Record<string, unknown>) {
  const next = Array.isArray(tokens) ? [...tokens] : [];
  const idx = next.findIndex((row) => {
    if (!row || typeof row !== "object") return false;
    const o = row as Record<string, unknown>;
    return (
      String(o.chain || "").toLowerCase() === "proton" &&
      String(o.symbol || "").toUpperCase() === String(entry.symbol) &&
      String(o.account || "").toLowerCase() === String(entry.account)
    );
  });
  if (idx >= 0) next[idx] = { ...(next[idx] as object), ...entry };
  else next.push(entry);
  next.sort((a, b) => String((a as { name?: string }).name || "").localeCompare(String((b as { name?: string }).name || "")));
  return next;
}

async function openAlcorPr(
  token: string,
  login: string,
  args: {
    symbol: string;
    contract: string;
    name: string;
    website: string;
    desc: string;
    socials: string[];
    png: string;
  }
) {
  const repo = spec("alcor-ui", login);
  await mergeUpstream(token, repo);
  const branch = branchName(args.symbol, args.contract);
  await ensureBranch(token, repo, branch);
  const logoPath = alcorFile(args.symbol, args.contract);
  await putFile(token, repo, branch, logoPath, args.png, `Add ${args.symbol}@${args.contract} Proton logo`);
  const fundPath = "assets/fundamentals/proton.json";
  const fund = await fileContent(token, repo, branch, fundPath);
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(fund.text) as Record<string, unknown>;
  } catch {
    throw new Error("proton.json on the fork is not valid JSON.");
  }
  const key = `${args.symbol}@${args.contract}`;
  json[key] = {
    name: args.name,
    website: { link: args.website, name: args.name },
    tags: ["XPR", "flex"],
    socials: args.socials,
    description: args.desc,
  };
  await putFile(
    token,
    repo,
    branch,
    fundPath,
    Buffer.from(`${JSON.stringify(json, null, 2)}\n`, "utf8").toString("base64"),
    `Add ${key} Proton fundamentals`
  );
  return findOrOpenPr(
    token,
    repo,
    branch,
    `Add ${args.symbol}@${args.contract} Proton listing`,
    `Adds the 64x64 logo and fundamentals for ${args.symbol}@${args.contract} on Proton (XPR Network).`
  );
}

async function openAirdropsPr(
  token: string,
  login: string,
  args: {
    symbol: string;
    contract: string;
    name: string;
    png: string;
  }
) {
  const repo = spec("eos-airdrops", login);
  await mergeUpstream(token, repo);
  const branch = branchName(args.symbol, args.contract);
  await ensureBranch(token, repo, branch);
  const logoPath = airdropsFile(args.symbol, args.contract);
  await putFile(token, repo, branch, logoPath, args.png, `Add ${args.symbol} Proton logo`);
  const tokensFile = await fileContent(token, repo, branch, "tokens.json");
  let tokens: unknown[] = [];
  try {
    tokens = JSON.parse(tokensFile.text) as unknown[];
  } catch {
    throw new Error("tokens.json on the fork is not valid JSON.");
  }
  const logo = `https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/${args.symbol.trim().toLowerCase()}-${args.contract.trim().toLowerCase()}.png`;
  const next = upsertAirdrop(tokens, {
    name: args.name,
    logo,
    logo_lg: logo,
    symbol: args.symbol,
    account: args.contract,
    chain: "proton",
  });
  await putFile(
    token,
    repo,
    branch,
    "tokens.json",
    Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
    `Add ${args.symbol}@${args.contract} Proton token`
  );
  return findOrOpenPr(
    token,
    repo,
    branch,
    `Add ${args.symbol}@${args.contract} on Proton`,
    `Adds the Proton (XPR Network) token ${args.symbol}@${args.contract} and its logo.`
  );
}

async function handle(req: IncomingMessage, res: ServerResponse, token: string, login: string) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "POST /api/listing-pr." });
    return;
  }
  try {
    const raw = JSON.parse((await readBody(req, 900_000)) || "{}") as Record<string, unknown>;
    const action = String(raw.action || "pr");
    if (action === "sync") {
      const alcor = await mergeUpstream(token, spec("alcor-ui", login));
      const drops = await mergeUpstream(token, spec("eos-airdrops", login));
      send(res, 200, { ok: true, sync: `alcor-ui ${alcor}; eos-airdrops ${drops}` });
      return;
    }
    const target = String(raw.target || "") as Target;
    const symbol = String(raw.symbol || "").trim().toUpperCase();
    const contract = String(raw.contract || "").trim().toLowerCase();
    if (!/^[A-Z]{1,7}$/.test(symbol) || !/^[a-z1-5.]{1,12}$/.test(contract)) {
      send(res, 400, { error: "Need a valid symbol and contract." });
      return;
    }
    const name = String(raw.name || symbol).trim().slice(0, 16) || symbol;
    const website = String(raw.website || "").trim();
    const desc = String(raw.desc || "").trim();
    const socials = Array.isArray(raw.socials) ? raw.socials.map((s) => String(s).trim()).filter(Boolean) : [];
    const iconurl = String(raw.iconurl || "").trim();
    const png = await pngBytes(iconurl, typeof raw.pngBase64 === "string" ? raw.pngBase64 : undefined);
    if (target === "alcor-ui") {
      const pr = await openAlcorPr(token, login, { symbol, contract, name, website, desc, socials, png });
      send(res, 200, { ok: true, ...pr });
      return;
    }
    if (target === "eos-airdrops") {
      const pr = await openAirdropsPr(token, login, { symbol, contract, name, png });
      send(res, 200, { ok: true, ...pr });
      return;
    }
    send(res, 400, { error: "target must be alcor-ui or eos-airdrops." });
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
}

export function githubListingPlugin(env: Record<string, string>): Plugin {
  const token = env.GITHUB_TOKEN?.trim() || "";
  const login = env.GITHUB_LOGIN?.trim() || "dougbutner";

  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/api/listing-pr") {
      next();
      return;
    }
    if (!token) {
      send(res, 503, { error: "GITHUB_TOKEN is not set on the server. Add a PAT for dougbutner with repo scope." });
      return;
    }
    void handle(req, res, token, login);
  };

  return {
    name: "github-listing",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
