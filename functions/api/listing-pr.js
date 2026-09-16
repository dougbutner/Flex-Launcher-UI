const API = "https://api.github.com";
const MAX_PNG = 400_000;

function spec(target, login) {
  if (target === "alcor-ui") {
    return { upstreamOwner: "alcorexchange", upstreamRepo: "alcor-ui", forkOwner: login, defaultBranch: "master" };
  }
  return { upstreamOwner: "eoscafe", upstreamRepo: "eos-airdrops", forkOwner: login, defaultBranch: "master" };
}

function branchName(symbol, contract) {
  return `flex-listing-${String(symbol).trim().toLowerCase()}-${String(contract).trim().toLowerCase().replace(/\./g, "-")}`;
}

async function gh(token, method, path, body) {
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
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function mergeUpstream(token, repo) {
  const r = await gh(token, "POST", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/merge-upstream`, {
    branch: repo.defaultBranch,
  });
  if (r.status === 409) {
    throw new Error(`Fork ${repo.forkOwner}/${repo.upstreamRepo} has a conflict with upstream. Sync it on GitHub, then try again.`);
  }
  if (!r.ok && r.status !== 422) {
    throw new Error(String(r.json.message || `Could not sync ${repo.forkOwner}/${repo.upstreamRepo} (${r.status}).`));
  }
  return String(r.json.merge_type || r.json.message || "synced");
}

async function putFile(token, repo, branch, path, contentB64, message) {
  const existing = await gh(
    token,
    "GET",
    `/repos/${repo.forkOwner}/${repo.upstreamRepo}/contents/${path}?ref=${encodeURIComponent(branch)}`
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

async function ensureBranch(token, repo, branch) {
  const base = await gh(token, "GET", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/git/ref/heads/${repo.defaultBranch}`);
  const sha = base.json.object && base.json.object.sha;
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

async function findOrOpenPr(token, repo, branch, title, body) {
  const head = `${repo.forkOwner}:${branch}`;
  const listed = await gh(
    token,
    "GET",
    `/repos/${repo.upstreamOwner}/${repo.upstreamRepo}/pulls?head=${encodeURIComponent(head)}&state=all&per_page=5`
  );
  const rows = Array.isArray(listed.json) ? listed.json : [];
  const open = rows.find((r) => r.state === "open");
  const any = open || rows[0];
  if (open && open.html_url) {
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
    if (created.status === 422 && any && any.html_url) {
      return {
        url: any.html_url,
        number: any.number,
        state: any.merged_at ? "merged" : any.state || "closed",
        already: true,
      };
    }
    throw new Error(msg || "Could not open the pull request.");
  }
  return { url: String(created.json.html_url || ""), number: Number(created.json.number || 0), state: "open", already: false };
}

async function fileContent(token, repo, branch, path) {
  const got = await gh(token, "GET", `/repos/${repo.forkOwner}/${repo.upstreamRepo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
  if (!got.ok || typeof got.json.content !== "string") throw new Error(`Missing ${path} on the fork.`);
  const text = Buffer.from(String(got.json.content).replace(/\n/g, ""), "base64").toString("utf8");
  return { text, sha: typeof got.json.sha === "string" ? got.json.sha : undefined };
}

async function pngBytes(iconurl, pngBase64) {
  if (pngBase64 && pngBase64.length < MAX_PNG * 2) return String(pngBase64).replace(/^data:image\/png;base64,/, "");
  if (!iconurl) throw new Error("Need an icon URL or a PNG.");
  const res = await fetch(iconurl);
  if (!res.ok) throw new Error(`Could not download the logo (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PNG) throw new Error("Logo is too large to commit (max 400 KB).");
  return buf.toString("base64");
}

function upsertAirdrop(tokens, entry) {
  const next = Array.isArray(tokens) ? [...tokens] : [];
  const idx = next.findIndex((row) => {
    if (!row || typeof row !== "object") return false;
    return (
      String(row.chain || "").toLowerCase() === "proton" &&
      String(row.symbol || "").toUpperCase() === String(entry.symbol) &&
      String(row.account || "").toLowerCase() === String(entry.account)
    );
  });
  if (idx >= 0) next[idx] = { ...next[idx], ...entry };
  else next.push(entry);
  next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return next;
}

export async function onRequestPost({ request, env }) {
  const token = String(env.GITHUB_TOKEN || "").trim();
  const login = String(env.GITHUB_LOGIN || "dougbutner").trim();
  if (!token) {
    return Response.json(
      { error: "GITHUB_TOKEN is not set on the server. Add a PAT for dougbutner with repo scope." },
      { status: 503 }
    );
  }
  try {
    const raw = await request.json();
    const action = String(raw.action || "pr");
    if (action === "sync") {
      const alcor = await mergeUpstream(token, spec("alcor-ui", login));
      const drops = await mergeUpstream(token, spec("eos-airdrops", login));
      return Response.json({ ok: true, sync: `alcor-ui ${alcor}; eos-airdrops ${drops}` });
    }
    const target = String(raw.target || "");
    const symbol = String(raw.symbol || "").trim().toUpperCase();
    const contract = String(raw.contract || "").trim().toLowerCase();
    if (!/^[A-Z]{1,7}$/.test(symbol) || !/^[a-z1-5.]{1,12}$/.test(contract)) {
      return Response.json({ error: "Need a valid symbol and contract." }, { status: 400 });
    }
    const name = String(raw.name || symbol).trim().slice(0, 16) || symbol;
    const website = String(raw.website || "").trim();
    const desc = String(raw.desc || "").trim();
    const socials = Array.isArray(raw.socials) ? raw.socials.map((s) => String(s).trim()).filter(Boolean) : [];
    const png = await pngBytes(String(raw.iconurl || "").trim(), raw.pngBase64);
    const repo = spec(target, login);
    await mergeUpstream(token, repo);
    const branch = branchName(symbol, contract);
    await ensureBranch(token, repo, branch);
    if (target === "alcor-ui") {
      await putFile(
        token,
        repo,
        branch,
        `assets/tokens/proton/${symbol.toLowerCase()}_${contract}.png`,
        png,
        `Add ${symbol}@${contract} Proton logo`
      );
      const fund = await fileContent(token, repo, branch, "assets/fundamentals/proton.json");
      const json = JSON.parse(fund.text);
      json[`${symbol}@${contract}`] = {
        name,
        website: { link: website, name },
        tags: ["XPR", "flex"],
        socials,
        description: desc,
      };
      await putFile(
        token,
        repo,
        branch,
        "assets/fundamentals/proton.json",
        Buffer.from(`${JSON.stringify(json, null, 2)}\n`, "utf8").toString("base64"),
        `Add ${symbol}@${contract} Proton fundamentals`
      );
      const pr = await findOrOpenPr(
        token,
        repo,
        branch,
        `Add ${symbol}@${contract} Proton listing`,
        `Adds the 64x64 logo and fundamentals for ${symbol}@${contract} on Proton (XPR Network).`
      );
      return Response.json({ ok: true, ...pr });
    }
    if (target === "eos-airdrops") {
      const logoName = `${symbol.toLowerCase()}-${contract}.png`;
      await putFile(token, repo, branch, `logos/${logoName}`, png, `Add ${symbol} Proton logo`);
      const tokensFile = await fileContent(token, repo, branch, "tokens.json");
      const tokens = JSON.parse(tokensFile.text);
      const logo = `https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/${logoName}`;
      const next = upsertAirdrop(tokens, { name, logo, logo_lg: logo, symbol, account: contract, chain: "proton" });
      await putFile(
        token,
        repo,
        branch,
        "tokens.json",
        Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8").toString("base64"),
        `Add ${symbol}@${contract} Proton token`
      );
      const pr = await findOrOpenPr(
        token,
        repo,
        branch,
        `Add ${symbol}@${contract} on Proton`,
        `Adds the Proton (XPR Network) token ${symbol}@${contract} and its logo.`
      );
      return Response.json({ ok: true, ...pr });
    }
    return Response.json({ error: "target must be alcor-ui or eos-airdrops." }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
