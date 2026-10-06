<?php

function valid_account($name)
{
    if (!preg_match('/^[a-z1-5.]{1,12}$/', $name)) {
        return false;
    }
    return $name[0] !== "." && substr($name, -1) !== ".";
}

function valid_symbol($code)
{
    return (bool) preg_match('/^[A-Z]{1,7}$/', $code);
}

function flex_contracts($cfg)
{
    return [
        strtolower(trim($cfg["VITE_EASYFLEX"])),
        strtolower(trim($cfg["VITE_COMPLEXFLEX"])),
        strtolower(trim($cfg["VITE_FLEXFOREX_CONTRACT"])),
    ];
}

function parse_manager_token($raw)
{
    if (!is_array($raw)) {
        return null;
    }
    $issuer = strtolower(trim(isset($raw["issuer"]) ? strval($raw["issuer"]) : ""));
    $contract = strtolower(trim(isset($raw["contract"]) ? strval($raw["contract"]) : ""));
    $symbol = strtoupper(trim(isset($raw["symbol"]) ? strval($raw["symbol"]) : ""));
    $program = trim(isset($raw["program"]) ? strval($raw["program"]) : "");
    $createTx = trim(isset($raw["createTx"]) ? strval($raw["createTx"]) : "");
    $okProgram = $program === "easyflex" || $program === "complexflex" || $program === "flexforex";
    if (!valid_account($issuer) || !valid_account($contract) || !valid_symbol($symbol) || !$okProgram || $createTx === "") {
        return null;
    }
    $raw["issuer"] = $issuer;
    $raw["contract"] = $contract;
    $raw["symbol"] = $symbol;
    $raw["program"] = $program;
    $raw["createTx"] = $createTx;
    return $raw;
}

function canon_cache_key($raw)
{
    $key = trim($raw);
    $shared = [
        "board:tokens",
        "rooms:launches",
        "rain:drylands",
        "alcor:usd",
        "mcaps:majors",
        "proton:tokens",
        "calendar:events",
    ];
    if (in_array($key, $shared, true)) {
        return $key;
    }
    if (preg_match('/^market:([a-z1-5.]{1,12}):([a-z]{1,7}):(\d{1,12})$/i', $key, $m)) {
        return "market:" . strtolower($m[1]) . ":" . strtoupper($m[2]) . ":" . $m[3];
    }
    if (preg_match('/^token:([a-z1-5.]{1,12}):([a-z]{1,7})$/i', $key, $m)) {
        return "token:" . strtolower($m[1]) . ":" . strtoupper($m[2]);
    }
    if (preg_match('/^book:([a-z1-5.]{1,12}):([a-z]{1,7})$/i', $key, $m)) {
        return "book:" . strtolower($m[1]) . ":" . strtoupper($m[2]);
    }
    if (preg_match('/^marks:([a-z1-5.]{1,12}):([a-z]{1,7})$/i', $key, $m)) {
        return "marks:" . strtolower($m[1]) . ":" . strtoupper($m[2]);
    }
    if (preg_match('/^metrics:([a-z1-5.]{1,12}):([a-z]{1,7}):(\d{1,12})$/i', $key, $m)) {
        return "metrics:" . strtolower($m[1]) . ":" . strtoupper($m[2]) . ":" . $m[3];
    }
    return null;
}

function is_cache_fresh($refreshedAt, $now)
{
    return $refreshedAt > 0 && $now - $refreshedAt < 15000;
}
