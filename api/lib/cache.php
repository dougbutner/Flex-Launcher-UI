<?php

define("CACHE_LOCK_MS", 60000);
define("CACHE_MAX_PAYLOAD", 3000000);

function cache_parse_payload($raw)
{
    if ($raw === null || $raw === "" || $raw === "null") {
        return null;
    }
    $data = json_decode($raw, true);
    return $data === null && $raw !== "null" && $raw !== "[]" && $raw !== "{}" ? $raw : $data;
}

function cache_read_row(PDO $pdo, $key)
{
    $row = db_get($pdo, "SELECT payload, refreshed_at, refresh_lock FROM cache_entries WHERE cache_key = ?", [$key]);
    if (!$row) {
        return null;
    }
    return [
        "data" => cache_parse_payload(isset($row["payload"]) ? $row["payload"] : null),
        "refreshedAt" => intval($row["refreshed_at"]),
        "lock" => intval($row["refresh_lock"]),
    ];
}

function cache_claim(PDO $pdo, $key, $now, $force)
{
    $lockUntil = $now + CACHE_LOCK_MS;
    $existing = cache_read_row($pdo, $key);
    if (!$existing) {
        $ins = db_run($pdo, "INSERT IGNORE INTO cache_entries (cache_key, payload, refreshed_at, refresh_lock) VALUES (?, 'null', 0, ?)", [
            $key,
            $lockUntil,
        ]);
        return $ins["affectedRows"] === 1 ? $lockUntil : null;
    }
    $upd = db_run($pdo, "UPDATE cache_entries SET refresh_lock = ? WHERE cache_key = ? AND (refresh_lock < ? OR ? = 1)", [
        $lockUntil,
        $key,
        $now,
        $force ? 1 : 0,
    ]);
    return $upd["affectedRows"] === 1 ? $lockUntil : null;
}

function cache_save(PDO $pdo, $key, $data, $startedAt, $lockUntil)
{
    $payload = json_encode($data, JSON_UNESCAPED_SLASHES);
    if (strlen($payload) > CACHE_MAX_PAYLOAD) {
        throw new RuntimeException("Snapshot is too large.");
    }
    $writtenAt = intval(round(microtime(true) * 1000));
    db_run(
        $pdo,
        "UPDATE cache_entries
         SET payload = ?, refreshed_at = ?, refresh_lock = 0
         WHERE cache_key = ? AND refresh_lock = ? AND refreshed_at <= ?",
        [$payload, $writtenAt, $key, $lockUntil, $startedAt]
    );
}

function cache_refresh($cfg, $key)
{
    $base = rtrim($cfg["CACHE_REFRESH_URL"], "/");
    if ($base === "") {
        throw new RuntimeException("CACHE_REFRESH_URL is not set.");
    }
    $url = $base . "?key=" . rawurlencode($key);
    if ($cfg["REFRESH_SECRET"] !== "") {
        $url .= "&secret=" . rawurlencode($cfg["REFRESH_SECRET"]);
    }
    $res = http_json($url, "GET", null, [], 45);
    if (!$res["ok"] || !array_key_exists("data", $res["json"])) {
        $err = isset($res["json"]["error"]) ? strval($res["json"]["error"]) : "Snapshot refresh failed.";
        throw new RuntimeException($err);
    }
    return $res["json"]["data"];
}

function read_cached(PDO $pdo, $cfg, $rawKey, $force)
{
    $key = canon_cache_key($rawKey);
    if (!$key) {
        return [400, ["error" => "Unknown cache key."]];
    }
    $now = intval(round(microtime(true) * 1000));
    $row = cache_read_row($pdo, $key);
    if (!$force && $row && is_cache_fresh($row["refreshedAt"], $now)) {
        return [200, ["fresh" => true, "data" => $row["data"], "refreshedAt" => $row["refreshedAt"], "db" => true]];
    }
    if (!$force && $row && $row["lock"] > $now && $row["refreshedAt"] > 0) {
        return [200, ["fresh" => false, "locked" => true, "data" => $row["data"], "refreshedAt" => $row["refreshedAt"], "db" => true]];
    }
    $lockUntil = cache_claim($pdo, $key, $now, $force);
    if ($lockUntil === null) {
        $again = cache_read_row($pdo, $key);
        if (!$force && $again && $again["refreshedAt"] > 0) {
            return [
                200,
                [
                    "fresh" => is_cache_fresh($again["refreshedAt"], intval(round(microtime(true) * 1000))),
                    "locked" => true,
                    "data" => $again["data"],
                    "refreshedAt" => $again["refreshedAt"],
                    "db" => true,
                ],
            ];
        }
        $lockUntil = cache_claim($pdo, $key, intval(round(microtime(true) * 1000)), $force);
    }
    if ($lockUntil === null) {
        $held = cache_read_row($pdo, $key);
        if ($held && $held["refreshedAt"] > 0) {
            return [200, ["fresh" => false, "locked" => true, "data" => $held["data"], "refreshedAt" => $held["refreshedAt"], "db" => true]];
        }
        return [503, ["error" => "Snapshot refresh is already running.", "db" => true]];
    }
    $startedAt = intval(round(microtime(true) * 1000));
    try {
        $data = cache_refresh($cfg, $key);
        cache_save($pdo, $key, $data, $startedAt, $lockUntil);
        return [200, ["fresh" => true, "data" => $data, "refreshedAt" => $startedAt, "db" => true]];
    } catch (Exception $e) {
        db_run($pdo, "UPDATE cache_entries SET refresh_lock = 0 WHERE cache_key = ? AND refresh_lock = ?", [$key, $lockUntil]);
        if ($row && $row["refreshedAt"] > 0) {
            return [200, ["fresh" => false, "data" => $row["data"], "refreshedAt" => $row["refreshedAt"], "error" => $e->getMessage(), "db" => true]];
        }
        return [503, ["error" => $e->getMessage(), "db" => true]];
    }
}

function clear_cached(PDO $pdo)
{
    db_run($pdo, "DELETE FROM cache_entries");
}
