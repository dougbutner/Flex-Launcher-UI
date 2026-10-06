<?php

define("INSIDERS_COOLDOWN_MS", 12000);
define("INSIDERS_CAPTCHA_TTL_MS", 600000);
define("INSIDERS_RPC", "https://proton.greymass.com");
define("INSIDERS_BODY_USER_MAX", 480);
define("INSIDERS_BODY_STORED_MAX", 500);

function allowed_rooms($cfg)
{
    $rooms = array_merge(flex_contracts($cfg), ["mon3y", "w3won", "gold.mon3y", "m3m3"]);
    $out = [];
    foreach ($rooms as $r) {
        $out[] = strtolower($r);
    }
    return $out;
}

function random_captcha_id()
{
    return bin2hex(random_bytes(12));
}

function asset_amount($value)
{
    if (!preg_match('/^(-?\d+)(?:\.(\d+))?\s+[A-Z]{1,7}$/', trim($value), $m)) {
        return 0;
    }
    return floatval(isset($m[2]) ? $m[1] . "." . $m[2] : $m[1]);
}

function rpc_json($path, $body)
{
    $res = http_json(INSIDERS_RPC . $path, "POST", json_encode($body), ["Content-Type" => "application/json"], 8);
    if (!$res["ok"]) {
        throw new RuntimeException("Chain read failed.");
    }
    return $res["json"];
}

function is_holder($contract, $symbol, $actor)
{
    try {
        $data = rpc_json("/v1/chain/get_table_rows", [
            "json" => true,
            "code" => $contract,
            "scope" => $symbol,
            "table" => "flexers",
            "lower_bound" => $actor,
            "upper_bound" => $actor,
            "limit" => 1,
        ]);
        $row = isset($data["rows"][0]) ? $data["rows"][0] : null;
        if (
            $row &&
            strtolower(isset($row["owner"]) ? strval($row["owner"]) : "") === $actor &&
            asset_amount(isset($row["balance"]) ? strval($row["balance"]) : "") > 0
        ) {
            return true;
        }
    } catch (Exception $e) {
        /* quote tokens have no flexers */
    }
    $bals = rpc_json("/v1/chain/get_currency_balance", [
        "code" => $contract,
        "account" => $actor,
        "symbol" => $symbol,
    ]);
    if (!is_array($bals)) {
        return false;
    }
    foreach ($bals as $row) {
        $text = strval($row);
        if (asset_amount($text) > 0 && strpos(strtoupper($text), $symbol) !== false) {
            return true;
        }
    }
    return false;
}

function purge_captcha(PDO $pdo)
{
    db_run($pdo, "DELETE FROM captcha WHERE expires_at < ?", [intval(round(microtime(true) * 1000))]);
}

function handle_captcha(PDO $pdo)
{
    purge_captcha($pdo);
    $a = 1 + intval(floor(mt_rand(0, 8)));
    $b = 1 + intval(floor(mt_rand(0, 8)));
    $id = random_captcha_id();
    db_run($pdo, "INSERT INTO captcha (id, answer, expires_at) VALUES (?, ?, ?)", [
        $id,
        strval($a + $b),
        intval(round(microtime(true) * 1000)) + INSIDERS_CAPTCHA_TTL_MS,
    ]);
    return [200, ["id" => $id, "prompt" => $a . " + " . $b]];
}

function consume_captcha(PDO $pdo, $id, $answer)
{
    purge_captcha($pdo);
    $row = db_get($pdo, "SELECT answer FROM captcha WHERE id = ?", [$id]);
    db_run($pdo, "DELETE FROM captcha WHERE id = ?", [$id]);
    return $row && strval($row["answer"]) === trim($answer);
}

function utc_day_start($ms)
{
    $d = gmdate("Y-m-d", intval($ms / 1000));
    return intval(strtotime($d . " UTC")) * 1000;
}

function parse_feed_range($raw)
{
    $v = strtolower(trim($raw ? $raw : "day"));
    if ($v === "week" || $v === "month" || $v === "year" || $v === "all") {
        return $v;
    }
    return "day";
}

function range_since($range)
{
    $now = intval(round(microtime(true) * 1000));
    if ($range === "all") {
        return 0;
    }
    if ($range === "day") {
        return utc_day_start($now);
    }
    if ($range === "week") {
        return $now - 7 * 86400000;
    }
    if ($range === "month") {
        return $now - 30 * 86400000;
    }
    return $now - 365 * 86400000;
}

function valid_giphy_url($url)
{
    if ($url === "" || strlen($url) > 500) {
        return false;
    }
    $p = parse_url($url);
    if (!$p || !isset($p["scheme"]) || strtolower($p["scheme"]) !== "https" || !isset($p["host"])) {
        return false;
    }
    $host = strtolower($p["host"]);
    return $host === "giphy.com" || $host === "i.giphy.com" || $host === "media.giphy.com" || (bool) preg_match('/^media\d+\.giphy\.com$/', $host);
}

function append_symbol_tag($text, $symbol)
{
    $code = strtoupper(substr(trim($symbol), 0, 7));
    $tag = " $" . $code;
    $raw = preg_replace('/\s+\$[A-Z]{1,7}$/', "", trim($text));
    $user = substr($raw, 0, INSIDERS_BODY_USER_MAX);
    $out = $user . $tag;
    return strlen($out) <= INSIDERS_BODY_STORED_MAX ? $out : substr($out, 0, INSIDERS_BODY_STORED_MAX);
}

function post_select_sql()
{
    return "SELECT p.id, p.contract, p.symbol, p.author, p.body, p.parent_id AS parentId, p.created_at AS createdAt,
  p.author_score AS authorScore, p.giphy_url AS giphyUrl,
  (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id) AS replyCount,
  (SELECT COUNT(*) FROM ups u WHERE u.post_id = p.id) AS upCount,
  (SELECT COALESCE(SUM(u.amount_raw), 0) FROM ups u WHERE u.post_id = p.id) AS upEasy
 FROM posts p";
}

function activity_map(PDO $pdo, $contract, $symbol)
{
    $since = intval(round(microtime(true) * 1000)) - 24 * 60 * 60 * 1000;
    if ($contract && $symbol) {
        $rows = db_all($pdo, "SELECT author, COUNT(*) AS n FROM posts WHERE contract = ? AND symbol = ? AND created_at >= ? GROUP BY author", [
            $contract,
            $symbol,
            $since,
        ]);
    } else {
        $rows = db_all($pdo, "SELECT author, COUNT(*) AS n FROM posts WHERE created_at >= ? GROUP BY author", [$since]);
    }
    $out = [];
    foreach ($rows as $row) {
        $out[$row["author"]] = intval($row["n"]);
    }
    return $out;
}

function ups_easy_map(PDO $pdo)
{
    $since = intval(round(microtime(true) * 1000)) - 24 * 60 * 60 * 1000;
    $rows = db_all($pdo, "SELECT to_account AS a, SUM(amount_raw) AS n FROM ups WHERE created_at >= ? GROUP BY to_account", [$since]);
    $out = [];
    foreach ($rows as $row) {
        $out[$row["a"]] = intval($row["n"]);
    }
    return $out;
}

function handle_feed(PDO $pdo, $contract, $symbol, $parent, $rangeRaw, $global)
{
    $contract = strtolower(trim($contract));
    $symbol = strtoupper(trim($symbol));
    $range = parse_feed_range($rangeRaw);
    if (!$global && (!valid_account($contract) || !valid_symbol($symbol))) {
        return [400, ["error" => "Need contract and symbol."]];
    }
    $parentId = $parent !== "" ? intval($parent) : null;
    $since = range_since($range);
    $dayAgo = intval(round(microtime(true) * 1000)) - 24 * 60 * 60 * 1000;
    $order = "ORDER BY (p.author_score + COALESCE((SELECT SUM(amount_raw) FROM ups u WHERE u.to_account = p.author AND u.created_at >= ?), 0)) DESC, p.created_at DESC LIMIT 80";
    if ($parentId !== null && $parent !== "") {
        $rows = db_all($pdo, post_select_sql() . " WHERE p.contract = ? AND p.symbol = ? AND p.parent_id = ? ORDER BY p.created_at ASC LIMIT 200", [
            $contract,
            $symbol,
            $parentId,
        ]);
    } elseif ($global) {
        $rows = db_all($pdo, post_select_sql() . " WHERE p.parent_id IS NULL AND p.created_at >= ? " . $order, [$since, $dayAgo]);
    } else {
        $rows = db_all($pdo, post_select_sql() . " WHERE p.contract = ? AND p.symbol = ? AND p.parent_id IS NULL AND p.created_at >= ? " . $order, [
            $contract,
            $symbol,
            $since,
            $dayAgo,
        ]);
    }
    return [
        200,
        [
            "posts" => $rows,
            "activity" => $global ? activity_map($pdo, "", "") : activity_map($pdo, $contract, $symbol),
            "upsEasy" => ups_easy_map($pdo),
            "range" => $range,
        ],
    ];
}

function handle_post(PDO $pdo, $cfg, $body)
{
    $contract = strtolower(trim(isset($body["contract"]) ? strval($body["contract"]) : ""));
    $symbol = strtoupper(trim(isset($body["symbol"]) ? strval($body["symbol"]) : ""));
    $author = strtolower(trim(isset($body["actor"]) ? strval($body["actor"]) : ""));
    $rawText = isset($body["body"]) ? strval($body["body"]) : "";
    $captchaId = trim(isset($body["captchaId"]) ? strval($body["captchaId"]) : "");
    $captchaAnswer = trim(isset($body["captchaAnswer"]) ? strval($body["captchaAnswer"]) : "");
    $giphy = trim(isset($body["giphyUrl"]) ? strval($body["giphyUrl"]) : "");
    $scoreIn = isset($body["authorScore"]) ? floatval($body["authorScore"]) : 0;
    $authorScore = is_numeric($scoreIn) ? max(0, min(100, intval(round($scoreIn)))) : 0;
    $parentRaw = isset($body["parentId"]) ? $body["parentId"] : null;
    $parentId = $parentRaw === null || $parentRaw === "" ? null : intval($parentRaw);
    if (!in_array($contract, allowed_rooms($cfg), true) || !valid_account($contract) || !valid_symbol($symbol) || !valid_account($author)) {
        return [400, ["error" => "Unknown room or account."]];
    }
    $userLen = strlen(preg_replace('/\s+\$[A-Z]{1,7}$/', "", trim($rawText)));
    if (trim($rawText) === "" || $userLen > INSIDERS_BODY_USER_MAX) {
        return [400, ["error" => "Write 1-" . INSIDERS_BODY_USER_MAX . " characters."]];
    }
    if ($giphy && !valid_giphy_url($giphy)) {
        return [400, ["error" => "GIF must be a Giphy https URL."]];
    }
    if (!consume_captcha($pdo, $captchaId, $captchaAnswer)) {
        return [400, ["error" => "Captcha failed. Try a new sum."]];
    }
    try {
        if (!is_holder($contract, $symbol, $author)) {
            return [403, ["error" => "Holders only. Buy the token, then post."]];
        }
    } catch (Exception $e) {
        return [503, ["error" => $e->getMessage()]];
    }
    $now = intval(round(microtime(true) * 1000));
    $last = db_get($pdo, "SELECT created_at FROM posts WHERE author = ? ORDER BY created_at DESC LIMIT 1", [$author]);
    if ($last && isset($last["created_at"]) && $now - intval($last["created_at"]) < INSIDERS_COOLDOWN_MS) {
        return [429, ["error" => "Slow down a few seconds.", "nextAt" => intval($last["created_at"]) + INSIDERS_COOLDOWN_MS]];
    }
    if ($parentId !== null) {
        $parent = db_get($pdo, "SELECT id FROM posts WHERE id = ? AND contract = ? AND symbol = ?", [$parentId, $contract, $symbol]);
        if (!$parent) {
            return [404, ["error" => "Parent post is gone."]];
        }
    } else {
        $day = utc_day_start($now);
        $used = db_get($pdo, "SELECT COUNT(*) AS n FROM posts WHERE author = ? AND parent_id IS NULL AND created_at >= ?", [$author, $day]);
        if (intval(isset($used["n"]) ? $used["n"] : 0) > 0) {
            return [429, ["error" => "One post per UTC day. Replies stay open."]];
        }
    }
    $text = append_symbol_tag($rawText, $symbol);
    $info = db_run(
        $pdo,
        "INSERT INTO posts (contract, symbol, author, parent_id, body, created_at, author_score, giphy_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [$contract, $symbol, $author, $parentId, $text, $now, $authorScore, $giphy]
    );
    return [200, ["id" => $info["insertId"], "createdAt" => $now, "authorScore" => $authorScore]];
}

function handle_up(PDO $pdo, $body)
{
    $postId = intval(isset($body["postId"]) ? $body["postId"] : 0);
    $from = strtolower(trim(isset($body["from"]) ? strval($body["from"]) : (isset($body["actor"]) ? strval($body["actor"]) : "")));
    $txid = strtolower(trim(isset($body["txid"]) ? strval($body["txid"]) : ""));
    $amountRaw = intval(floor(floatval(isset($body["amountRaw"]) ? $body["amountRaw"] : (isset($body["amount"]) ? $body["amount"] : 0))));
    $quantity = trim(isset($body["quantity"]) ? strval($body["quantity"]) : "");
    if ($postId < 1 || !valid_account($from) || !preg_match('/^[0-9a-f]{64}$/', $txid) || !($amountRaw > 0) || $amountRaw > 10000) {
        return [400, ["error" => "Need post, account, whole EASY, and tx hash."]];
    }
    $post = db_get($pdo, "SELECT id, author FROM posts WHERE id = ?", [$postId]);
    if (!$post) {
        return [404, ["error" => "Post is gone."]];
    }
    if ($post["author"] === $from) {
        return [400, ["error" => "Cannot UP your own post."]];
    }
    $qty = $quantity ? $quantity : $amountRaw . ".000000 EASY";
    try {
        db_run($pdo, "INSERT INTO ups (post_id, from_account, to_account, amount_raw, quantity, txid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
            $postId,
            $from,
            $post["author"],
            $amountRaw,
            substr($qty, 0, 40),
            $txid,
            intval(round(microtime(true) * 1000)),
        ]);
    } catch (PDOException $e) {
        return [409, ["error" => "That tx was already recorded."]];
    }
    return [200, ["ok" => true, "txid" => $txid]];
}
