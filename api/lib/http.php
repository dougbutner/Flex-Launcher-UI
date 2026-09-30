<?php

function json_input()
{
    $raw = file_get_contents("php://input");
    if ($raw === false || $raw === "") {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException("Invalid JSON.");
    }
    return $data;
}

function request_path()
{
    $uri = parse_url(isset($_SERVER["REQUEST_URI"]) ? $_SERVER["REQUEST_URI"] : "/", PHP_URL_PATH);
    $path = $uri ? $uri : "/";
    if (strlen($path) > 1) {
        $path = rtrim($path, "/");
    }
    $script = str_replace("\\", "/", isset($_SERVER["SCRIPT_NAME"]) ? strval($_SERVER["SCRIPT_NAME"]) : "");
    $dir = rtrim(dirname($script), "/");
    if ($dir !== "" && $dir !== "." && $dir !== "/" && strpos($path, $dir) === 0) {
        $rest = substr($path, strlen($dir));
        if ($rest === "" || (isset($rest[0]) && $rest[0] === "/")) {
            $path = $rest === "" ? "/" : $rest;
        }
    }
    if ($path === "/index.php") {
        $path = "/";
    }
    if (strpos($path, "/api/") !== 0 && $path !== "/api") {
        $path = "/api" . ($path === "/" ? "/site" : $path);
    }
    return $path;
}

function query_param($name, $default = "")
{
    return isset($_GET[$name]) ? strval($_GET[$name]) : $default;
}

function http_json($url, $method, $body, $headers, $timeout)
{
    $ch = curl_init($url);
    $hdrs = [];
    foreach ($headers as $k => $v) {
        $hdrs[] = $k . ": " . $v;
    }
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $hdrs);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $raw = curl_exec($ch);
    $code = intval(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        throw new RuntimeException($err ? $err : "HTTP request failed.");
    }
    $json = json_decode($raw, true);
    return ["ok" => $code >= 200 && $code < 300, "status" => $code, "json" => is_array($json) ? $json : [], "raw" => $raw];
}

function default_allowed_origins()
{
    return [
        "https://flex.forex",
        "https://www.flex.forex",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ];
}

function cors_origin($allowed)
{
    $origin = isset($_SERVER["HTTP_ORIGIN"]) ? strval($_SERVER["HTTP_ORIGIN"]) : "";
    if ($origin === "") {
        return "";
    }
    $list = is_array($allowed) ? $allowed : [];
    foreach (default_allowed_origins() as $item) {
        if (!in_array($item, $list, true)) {
            $list[] = $item;
        }
    }
    foreach ($list as $item) {
        if ($item === $origin) {
            return $origin;
        }
    }
    if (preg_match('#^https://[a-z0-9-]+\.pages\.dev$#', $origin)) {
        return $origin;
    }
    return $origin;
}

function send_cors($allowed)
{
    $origin = isset($_SERVER["HTTP_ORIGIN"]) ? strval($_SERVER["HTTP_ORIGIN"]) : "";
    if ($origin === "") {
        header("Access-Control-Allow-Origin: *");
    } else {
        header("Access-Control-Allow-Origin: " . cors_origin($allowed));
        header("Vary: Origin");
    }
    header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
    header("Access-Control-Max-Age: 86400");
}

function send_json($status, $body)
{
    http_response_code($status);
    if ($status === 204) {
        header("Content-Length: 0");
        return;
    }
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
}
