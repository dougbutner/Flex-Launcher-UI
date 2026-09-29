<?php

header_remove("X-Powered-By");

$root = __DIR__;
$configFile = $root . "/config.php";
if (!is_file($configFile)) {
    http_response_code(503);
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode(["error" => "Copy config.example.php to config.php and fill in MySQL.", "db" => false]);
    exit;
}

require $configFile;
require $root . "/lib/http.php";
require $root . "/lib/db.php";
require $root . "/lib/accounts.php";
require $root . "/lib/manager.php";
require $root . "/lib/insiders.php";
require $root . "/lib/cache.php";
require $root . "/lib/pinata.php";
require $root . "/lib/listing.php";
require $root . "/lib/dispatch.php";

$cfg = [
    "MYSQL_HOST" => isset($MYSQL_HOST) ? strval($MYSQL_HOST) : "",
    "MYSQL_USER" => isset($MYSQL_USER) ? strval($MYSQL_USER) : "",
    "MYSQL_PASSWORD" => isset($MYSQL_PASSWORD) ? strval($MYSQL_PASSWORD) : "",
    "MYSQL_DATABASE" => isset($MYSQL_DATABASE) ? strval($MYSQL_DATABASE) : "",
    "MYSQL_PORT" => isset($MYSQL_PORT) ? intval($MYSQL_PORT) : 3306,
    "VITE_EASYFLEX" => isset($VITE_EASYFLEX) ? strval($VITE_EASYFLEX) : "3asy",
    "VITE_COMPLEXFLEX" => isset($VITE_COMPLEXFLEX) ? strval($VITE_COMPLEXFLEX) : "fl3x",
    "VITE_FLEXFOREX_CONTRACT" => isset($VITE_FLEXFOREX_CONTRACT) ? strval($VITE_FLEXFOREX_CONTRACT) : "for3x",
    "CACHE_REFRESH_URL" => isset($CACHE_REFRESH_URL) ? strval($CACHE_REFRESH_URL) : "",
    "REFRESH_SECRET" => isset($REFRESH_SECRET) ? strval($REFRESH_SECRET) : "",
    "PINATA_JWT" => isset($PINATA_JWT) ? strval($PINATA_JWT) : "",
    "PINATA_GATEWAY" => isset($PINATA_GATEWAY) ? strval($PINATA_GATEWAY) : "gateway.pinata.cloud",
    "GITHUB_TOKEN" => isset($GITHUB_TOKEN) ? strval($GITHUB_TOKEN) : "",
    "GITHUB_LOGIN" => isset($GITHUB_LOGIN) ? strval($GITHUB_LOGIN) : "dougbutner",
];
$allowed = isset($ALLOWED_ORIGINS) && is_array($ALLOWED_ORIGINS) ? $ALLOWED_ORIGINS : [];

send_cors($allowed);

$method = isset($_SERVER["REQUEST_METHOD"]) ? strtoupper($_SERVER["REQUEST_METHOD"]) : "GET";
if ($method === "OPTIONS") {
    send_json(204, []);
    exit;
}

try {
    $pair = dispatch_api($cfg, db_connect($cfg));
    send_json($pair[0], $pair[1]);
} catch (InvalidArgumentException $e) {
    send_json(400, ["error" => $e->getMessage()]);
} catch (PDOException $e) {
    send_json(503, ["error" => "MySQL query failed.", "db" => true]);
} catch (RuntimeException $e) {
    $msg = $e->getMessage();
    $noDb = strpos($msg, "MySQL is not configured") !== false;
    $path = request_path();
    if ($noDb && ($path === "/api/site" || $path === "/api/cache")) {
        send_json(200, ["live" => false, "db" => false]);
        exit;
    }
    if ($noDb && $path === "/api/txs") {
        send_json(200, ["stored" => false, "db" => false]);
        exit;
    }
    send_json($noDb ? 503 : 500, ["error" => $msg, "db" => !$noDb]);
} catch (Exception $e) {
    send_json(500, ["error" => $e->getMessage()]);
}
