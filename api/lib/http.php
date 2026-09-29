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

function cors_origin($allowed)
{
    $origin = isset($_SERVER["HTTP_ORIGIN"]) ? strval($_SERVER["HTTP_ORIGIN"]) : "";
    if ($origin === "") {
        return "";
    }
    foreach ($allowed as $item) {
        if ($item === $origin) {
            return $origin;
        }
    }
    if (preg_match('#^https://[a-z0-9-]+\.pages\.dev$#', $origin)) {
        return $origin;
    }
    return "";
}

function send_cors($allowed)
{
    $origin = cors_origin($allowed);
    if ($origin !== "") {
        header("Access-Control-Allow-Origin: " . $origin);
        header("Vary: Origin");
        header("Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS");
        header("Access-Control-Allow-Headers: Content-Type");
        header("Access-Control-Max-Age: 86400");
    }
}

function send_json($status, $body)
{
    http_response_code($status);
    if ($status === 204) {
        return;
    }
    header("Content-Type: application/json; charset=utf-8");
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
}
