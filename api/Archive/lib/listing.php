<?php

define("LISTING_MAX_PNG", 400000);
define("GITHUB_API", "https://api.github.com");

function listing_spec($target, $login)
{
    if ($target === "alcor-ui") {
        return [
            "upstreamOwner" => "alcorexchange",
            "upstreamRepo" => "alcor-ui",
            "forkOwner" => $login,
            "defaultBranch" => "master",
        ];
    }
    return [
        "upstreamOwner" => "eoscafe",
        "upstreamRepo" => "eos-airdrops",
        "forkOwner" => $login,
        "defaultBranch" => "master",
    ];
}

function listing_branch($symbol, $contract)
{
    return "flex-listing-" . strtolower($symbol) . "-" . str_replace(".", "-", strtolower($contract));
}

function gh($token, $method, $path, $body = null)
{
    $headers = [
        "Accept" => "application/vnd.github+json",
        "Authorization" => "Bearer " . $token,
        "X-GitHub-Api-Version" => "2022-11-28",
        "User-Agent" => "flex-launcher-api",
    ];
    if ($body !== null) {
        $headers["Content-Type"] = "application/json";
    }
    return http_json(GITHUB_API . $path, $method, $body !== null ? json_encode($body) : null, $headers, 30);
}

function merge_upstream($token, $repo)
{
    $r = gh($token, "POST", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/merge-upstream", [
        "branch" => $repo["defaultBranch"],
    ]);
    if ($r["status"] === 409) {
        throw new RuntimeException("Fork " . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . " has a conflict with upstream. Sync it on GitHub, then try again.");
    }
    if (!$r["ok"] && $r["status"] !== 422) {
        $msg = isset($r["json"]["message"]) ? strval($r["json"]["message"]) : "Could not sync " . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . " (" . $r["status"] . ").";
        throw new RuntimeException($msg);
    }
    if (isset($r["json"]["merge_type"])) {
        return strval($r["json"]["merge_type"]);
    }
    if (isset($r["json"]["message"])) {
        return strval($r["json"]["message"]);
    }
    return "synced";
}

function put_file($token, $repo, $branch, $path, $contentB64, $message)
{
    $existing = gh(
        $token,
        "GET",
        "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/contents/" . str_replace("%2F", "/", rawurlencode($path)) . "?ref=" . rawurlencode($branch)
    );
    $sha = isset($existing["json"]["sha"]) ? strval($existing["json"]["sha"]) : null;
    $payload = ["message" => $message, "content" => $contentB64, "branch" => $branch];
    if ($sha) {
        $payload["sha"] = $sha;
    }
    $put = gh($token, "PUT", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/contents/" . $path, $payload);
    if (!$put["ok"]) {
        throw new RuntimeException(isset($put["json"]["message"]) ? strval($put["json"]["message"]) : "Could not write " . $path . ".");
    }
}

function ensure_branch($token, $repo, $branch)
{
    $base = gh($token, "GET", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/git/ref/heads/" . $repo["defaultBranch"]);
    $sha = isset($base["json"]["object"]["sha"]) ? strval($base["json"]["object"]["sha"]) : "";
    if ($sha === "") {
        throw new RuntimeException("Missing " . $repo["defaultBranch"] . " on " . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . ".");
    }
    $existing = gh($token, "GET", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/git/ref/heads/" . $branch);
    if ($existing["ok"]) {
        gh($token, "POST", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/merges", [
            "base" => $branch,
            "head" => $repo["defaultBranch"],
        ]);
        return;
    }
    $created = gh($token, "POST", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/git/refs", [
        "ref" => "refs/heads/" . $branch,
        "sha" => $sha,
    ]);
    if (!$created["ok"]) {
        throw new RuntimeException(isset($created["json"]["message"]) ? strval($created["json"]["message"]) : "Could not create branch " . $branch . ".");
    }
}

function find_or_open_pr($token, $repo, $branch, $title, $body)
{
    $head = $repo["forkOwner"] . ":" . $branch;
    $listed = gh(
        $token,
        "GET",
        "/repos/" . $repo["upstreamOwner"] . "/" . $repo["upstreamRepo"] . "/pulls?head=" . rawurlencode($head) . "&state=all&per_page=5"
    );
    $rows = isset($listed["json"]) && is_array($listed["json"]) && isset($listed["json"][0]) ? $listed["json"] : [];
    $open = null;
    $any = null;
    foreach ($rows as $r) {
        if (!$any) {
            $any = $r;
        }
        if (isset($r["state"]) && $r["state"] === "open") {
            $open = $r;
            break;
        }
    }
    if ($open && !empty($open["html_url"])) {
        return ["url" => $open["html_url"], "number" => intval($open["number"]), "state" => "open", "already" => true];
    }
    $created = gh($token, "POST", "/repos/" . $repo["upstreamOwner"] . "/" . $repo["upstreamRepo"] . "/pulls", [
        "title" => $title,
        "body" => $body,
        "head" => $head,
        "base" => $repo["defaultBranch"],
    ]);
    if (!$created["ok"]) {
        $msg = isset($created["json"]["message"]) ? strval($created["json"]["message"]) : "";
        if ($created["status"] === 422 && $any && !empty($any["html_url"])) {
            return [
                "url" => $any["html_url"],
                "number" => intval($any["number"]),
                "state" => !empty($any["merged_at"]) ? "merged" : (isset($any["state"]) ? $any["state"] : "closed"),
                "already" => true,
            ];
        }
        throw new RuntimeException($msg ? $msg : "Could not open the pull request.");
    }
    return [
        "url" => isset($created["json"]["html_url"]) ? strval($created["json"]["html_url"]) : "",
        "number" => intval(isset($created["json"]["number"]) ? $created["json"]["number"] : 0),
        "state" => "open",
        "already" => false,
    ];
}

function file_content($token, $repo, $branch, $path)
{
    $got = gh($token, "GET", "/repos/" . $repo["forkOwner"] . "/" . $repo["upstreamRepo"] . "/contents/" . $path . "?ref=" . rawurlencode($branch));
    if (!$got["ok"] || !isset($got["json"]["content"])) {
        throw new RuntimeException("Missing " . $path . " on the fork.");
    }
    $text = base64_decode(str_replace("\n", "", strval($got["json"]["content"])));
    return ["text" => $text, "sha" => isset($got["json"]["sha"]) ? strval($got["json"]["sha"]) : ""];
}

function png_bytes($iconurl, $pngBase64)
{
    if ($pngBase64 && strlen($pngBase64) < LISTING_MAX_PNG * 2) {
        return preg_replace('#^data:image/png;base64,#', "", $pngBase64);
    }
    if ($iconurl === "") {
        throw new RuntimeException("Need an icon URL or a PNG.");
    }
    $ch = curl_init($iconurl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    $buf = curl_exec($ch);
    $code = intval(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    if ($buf === false || $code < 200 || $code >= 300) {
        throw new RuntimeException("Could not download the logo (" . $code . ").");
    }
    if (strlen($buf) > LISTING_MAX_PNG) {
        throw new RuntimeException("Logo is too large to commit (max 400 KB).");
    }
    return base64_encode($buf);
}

function upsert_airdrop($tokens, $entry)
{
    $next = is_array($tokens) ? $tokens : [];
    $idx = -1;
    foreach ($next as $i => $row) {
        if (!is_array($row)) {
            continue;
        }
        if (
            strtolower(isset($row["chain"]) ? strval($row["chain"]) : "") === "proton" &&
            strtoupper(isset($row["symbol"]) ? strval($row["symbol"]) : "") === strval($entry["symbol"]) &&
            strtolower(isset($row["account"]) ? strval($row["account"]) : "") === strval($entry["account"])
        ) {
            $idx = $i;
            break;
        }
    }
    if ($idx >= 0) {
        $next[$idx] = array_merge($next[$idx], $entry);
    } else {
        $next[] = $entry;
    }
    usort($next, function ($a, $b) {
        $an = isset($a["name"]) ? strval($a["name"]) : "";
        $bn = isset($b["name"]) ? strval($b["name"]) : "";
        return strcasecmp($an, $bn);
    });
    return $next;
}

function open_alcor_pr($token, $login, $args)
{
    $repo = listing_spec("alcor-ui", $login);
    merge_upstream($token, $repo);
    $branch = listing_branch($args["symbol"], $args["contract"]);
    ensure_branch($token, $repo, $branch);
    $logoPath = "assets/tokens/proton/" . strtolower($args["symbol"]) . "_" . strtolower($args["contract"]) . ".png";
    put_file($token, $repo, $branch, $logoPath, $args["png"], "Add " . $args["symbol"] . "@" . $args["contract"] . " Proton logo");
    $fundPath = "assets/fundamentals/proton.json";
    $fund = file_content($token, $repo, $branch, $fundPath);
    $json = json_decode($fund["text"], true);
    if (!is_array($json)) {
        throw new RuntimeException("proton.json on the fork is not valid JSON.");
    }
    $key = $args["symbol"] . "@" . $args["contract"];
    $json[$key] = [
        "name" => $args["name"],
        "website" => ["link" => $args["website"], "name" => $args["name"]],
        "tags" => ["XPR", "flex"],
        "socials" => $args["socials"],
        "description" => $args["desc"],
    ];
    put_file(
        $token,
        $repo,
        $branch,
        $fundPath,
        base64_encode(json_encode($json, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"),
        "Add " . $key . " Proton fundamentals"
    );
    return find_or_open_pr(
        $token,
        $repo,
        $branch,
        "Add " . $args["symbol"] . "@" . $args["contract"] . " Proton listing",
        "Adds the 64x64 logo and fundamentals for " . $args["symbol"] . "@" . $args["contract"] . " on Proton (XPR Network)."
    );
}

function open_airdrops_pr($token, $login, $args)
{
    $repo = listing_spec("eos-airdrops", $login);
    merge_upstream($token, $repo);
    $branch = listing_branch($args["symbol"], $args["contract"]);
    ensure_branch($token, $repo, $branch);
    $logoPath = "logos/" . strtolower($args["symbol"]) . "-" . strtolower($args["contract"]) . ".png";
    put_file($token, $repo, $branch, $logoPath, $args["png"], "Add " . $args["symbol"] . " Proton logo");
    $tokensFile = file_content($token, $repo, $branch, "tokens.json");
    $tokens = json_decode($tokensFile["text"], true);
    if (!is_array($tokens)) {
        throw new RuntimeException("tokens.json on the fork is not valid JSON.");
    }
    $logo = "https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/" . strtolower($args["symbol"]) . "-" . strtolower($args["contract"]) . ".png";
    $next = upsert_airdrop($tokens, [
        "name" => $args["name"],
        "logo" => $logo,
        "logo_lg" => $logo,
        "symbol" => $args["symbol"],
        "account" => $args["contract"],
        "chain" => "proton",
    ]);
    put_file(
        $token,
        $repo,
        $branch,
        "tokens.json",
        base64_encode(json_encode($next, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"),
        "Add " . $args["symbol"] . "@" . $args["contract"] . " Proton token"
    );
    return find_or_open_pr(
        $token,
        $repo,
        $branch,
        "Add " . $args["symbol"] . "@" . $args["contract"] . " on Proton",
        "Adds the Proton (XPR Network) token " . $args["symbol"] . "@" . $args["contract"] . " and its logo."
    );
}

function handle_listing_pr($cfg, $raw)
{
    $token = trim($cfg["GITHUB_TOKEN"]);
    $login = trim($cfg["GITHUB_LOGIN"]) ? trim($cfg["GITHUB_LOGIN"]) : "dougbutner";
    if ($token === "") {
        return [503, ["error" => "GITHUB_TOKEN is not set on the server. Add a PAT for dougbutner with repo scope."]];
    }
    $action = isset($raw["action"]) ? strval($raw["action"]) : "pr";
    if ($action === "sync") {
        $alcor = merge_upstream($token, listing_spec("alcor-ui", $login));
        $drops = merge_upstream($token, listing_spec("eos-airdrops", $login));
        return [200, ["ok" => true, "sync" => "alcor-ui " . $alcor . "; eos-airdrops " . $drops]];
    }
    $target = isset($raw["target"]) ? strval($raw["target"]) : "";
    $symbol = strtoupper(trim(isset($raw["symbol"]) ? strval($raw["symbol"]) : ""));
    $contract = strtolower(trim(isset($raw["contract"]) ? strval($raw["contract"]) : ""));
    if (!preg_match('/^[A-Z]{1,7}$/', $symbol) || !preg_match('/^[a-z1-5.]{1,12}$/', $contract)) {
        return [400, ["error" => "Need a valid symbol and contract."]];
    }
    $name = substr(trim(isset($raw["name"]) ? strval($raw["name"]) : $symbol), 0, 16);
    if ($name === "") {
        $name = $symbol;
    }
    $website = trim(isset($raw["website"]) ? strval($raw["website"]) : "");
    $desc = trim(isset($raw["desc"]) ? strval($raw["desc"]) : "");
    $socials = [];
    if (isset($raw["socials"]) && is_array($raw["socials"])) {
        foreach ($raw["socials"] as $s) {
            $t = trim(strval($s));
            if ($t !== "") {
                $socials[] = $t;
            }
        }
    }
    $iconurl = trim(isset($raw["iconurl"]) ? strval($raw["iconurl"]) : "");
    $png = png_bytes($iconurl, isset($raw["pngBase64"]) ? strval($raw["pngBase64"]) : "");
    if ($target === "alcor-ui") {
        $pr = open_alcor_pr($token, $login, [
            "symbol" => $symbol,
            "contract" => $contract,
            "name" => $name,
            "website" => $website,
            "desc" => $desc,
            "socials" => $socials,
            "png" => $png,
        ]);
        return [200, array_merge(["ok" => true], $pr)];
    }
    if ($target === "eos-airdrops") {
        $pr = open_airdrops_pr($token, $login, ["symbol" => $symbol, "contract" => $contract, "name" => $name, "png" => $png]);
        return [200, array_merge(["ok" => true], $pr)];
    }
    return [400, ["error" => "target must be alcor-ui or eos-airdrops."]];
}
