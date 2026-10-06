<?php

function admin_account($body, $cfg)
{
    $account = strtolower(trim(isset($body["account"]) ? strval($body["account"]) : ""));
    if (!in_array($account, flex_contracts($cfg), true)) {
        return null;
    }
    return $account;
}

function read_site(PDO $pdo)
{
    $row = db_get($pdo, "SELECT live, updated_at, updated_by FROM site_settings WHERE id = 1");
    if (!$row) {
        db_run($pdo, "INSERT INTO site_settings (id, live, updated_at, updated_by) VALUES (1, 0, 0, '')");
        return [200, ["live" => false, "db" => true, "updatedAt" => 0, "updatedBy" => ""]];
    }
    return [
        200,
        [
            "live" => intval($row["live"]) === 1,
            "db" => true,
            "updatedAt" => intval($row["updated_at"]),
            "updatedBy" => strval($row["updated_by"]),
        ],
    ];
}

function set_live(PDO $pdo, $cfg, $body)
{
    $account = admin_account($body, $cfg);
    if (!$account) {
        return [403, ["error" => "Connect as 3asy, fl3x, or for3x."]];
    }
    $live = !empty($body["live"]);
    $now = intval(round(microtime(true) * 1000));
    db_run(
        $pdo,
        "INSERT INTO site_settings (id, live, updated_at, updated_by) VALUES (1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE live = VALUES(live), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)",
        [$live ? 1 : 0, $now, $account]
    );
    return [200, ["live" => $live, "db" => true, "updatedAt" => $now, "updatedBy" => $account]];
}

function write_tx(PDO $pdo, $body)
{
    $txId = strtolower(trim(isset($body["txId"]) ? strval($body["txId"]) : ""));
    $actor = strtolower(trim(isset($body["actor"]) ? strval($body["actor"]) : ""));
    $contract = strtolower(trim(isset($body["contract"]) ? strval($body["contract"]) : ""));
    $action = substr(strtolower(trim(isset($body["action"]) ? strval($body["action"]) : "")), 0, 13);
    $symbol = strtoupper(trim(isset($body["symbol"]) ? strval($body["symbol"]) : ""));
    if (strpos($symbol, ",") !== false) {
        $parts = explode(",", $symbol);
        $symbol = end($parts);
    }
    $symbol = substr(preg_replace('/[^A-Z]/', "", $symbol), 0, 7);
    if (!preg_match('/^[0-9a-f]{64}$/', $txId)) {
        return [400, ["error" => "Need a 64 char tx id."]];
    }
    if (!valid_account($actor)) {
        return [400, ["error" => "Bad actor."]];
    }
    if ($contract && !valid_account($contract)) {
        return [400, ["error" => "Bad contract."]];
    }
    if ($symbol && !valid_symbol($symbol)) {
        $symbol = "";
    }
    $actions = isset($body["actions"]) && is_array($body["actions"]) ? $body["actions"] : [];
    $json = substr(json_encode($actions, JSON_UNESCAPED_SLASHES), 0, 20000);
    db_run(
        $pdo,
        "INSERT INTO chain_txs (tx_id, actor, contract, action_name, symbol, actions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE tx_id = tx_id",
        [$txId, $actor, $contract, $action, $symbol, $json, intval(round(microtime(true) * 1000))]
    );
    return [200, ["stored" => true, "txId" => $txId]];
}

function dispatch_api($cfg, PDO $pdo)
{
    $method = isset($_SERVER["REQUEST_METHOD"]) ? strtoupper($_SERVER["REQUEST_METHOD"]) : "GET";
    $path = request_path();
    if ($method === "OPTIONS") {
        return [204, []];
    }
    $body = [];
    if ($method !== "GET" && $method !== "HEAD" && $path !== "/api/ipfs/pin") {
        $body = json_input();
    }
    if ($path === "/api/site" && $method === "GET") {
        return read_site($pdo);
    }
    if ($path === "/api/cache" && $method === "GET") {
        return read_cached($pdo, $cfg, query_param("key"), query_param("force") === "1");
    }
    if ($path === "/api/txs" && $method === "POST") {
        return write_tx($pdo, $body);
    }
    if ($path === "/api/admin/live" && $method === "POST") {
        return set_live($pdo, $cfg, $body);
    }
    if ($path === "/api/admin/rebuild" && $method === "POST") {
        $account = admin_account($body, $cfg);
        if (!$account) {
            return [403, ["error" => "Connect as 3asy, fl3x, or for3x."]];
        }
        clear_cached($pdo);
        return [200, ["cleared" => true]];
    }
    if ($path === "/api/manager" && $method === "GET") {
        return list_manager($pdo, query_param("issuer"), query_param("contract"));
    }
    if ($path === "/api/manager" && ($method === "PUT" || $method === "POST")) {
        return put_manager($pdo, $cfg, $body);
    }
    if ($path === "/api/insiders/captcha" && $method === "GET") {
        return handle_captcha($pdo);
    }
    if (($path === "/api/insiders/feed" || $path === "/api/insiders") && $method === "GET") {
        return handle_feed($pdo, query_param("contract"), query_param("symbol"), query_param("parent"), query_param("range"), query_param("global") === "1");
    }
    if (($path === "/api/insiders/post" || $path === "/api/insiders") && $method === "POST") {
        return handle_post($pdo, $cfg, $body);
    }
    if ($path === "/api/insiders/up" && $method === "POST") {
        return handle_up($pdo, $body);
    }
    if ($path === "/api/ipfs/pin" && $method === "POST") {
        return handle_ipfs_pin($cfg);
    }
    if ($path === "/api/listing-pr" && $method === "POST") {
        return handle_listing_pr($cfg, $body);
    }
    return [404, ["error" => "Unknown route."]];
}
