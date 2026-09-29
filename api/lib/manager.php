<?php

function list_manager(PDO $pdo, $issuer, $contract)
{
    $issuer = strtolower(trim($issuer));
    $contract = strtolower(trim($contract));
    if ($issuer && !valid_account($issuer)) {
        return [400, ["error" => "Bad issuer."]];
    }
    if ($contract && !valid_account($contract)) {
        return [400, ["error" => "Bad contract."]];
    }
    if (!$issuer && !$contract) {
        return [400, ["error" => "Pass issuer or contract."]];
    }
    if ($issuer && $contract) {
        $rows = db_all($pdo, "SELECT body FROM manager_tokens WHERE issuer = ? AND contract = ? ORDER BY symbol", [$issuer, $contract]);
    } elseif ($issuer) {
        $rows = db_all($pdo, "SELECT body FROM manager_tokens WHERE issuer = ? ORDER BY contract, symbol", [$issuer]);
    } else {
        $rows = db_all($pdo, "SELECT body FROM manager_tokens WHERE contract = ? ORDER BY symbol", [$contract]);
    }
    $tokens = [];
    foreach ($rows as $row) {
        $parsed = json_decode(isset($row["body"]) ? $row["body"] : "", true);
        $ok = parse_manager_token($parsed);
        if ($ok) {
            $tokens[] = $ok;
        }
    }
    return [200, ["tokens" => $tokens]];
}

function put_manager(PDO $pdo, $cfg, $raw)
{
    $body = parse_manager_token($raw);
    if (!$body) {
        return [400, ["error" => "Invalid token row. Need issuer, contract, symbol, program, and createTx."]];
    }
    $contract = strval($body["contract"]);
    $symbol = strval($body["symbol"]);
    $issuer = strval($body["issuer"]);
    if (!in_array($contract, flex_contracts($cfg), true)) {
        return [400, ["error" => "Unknown flex contract."]];
    }
    $existing = db_get($pdo, "SELECT issuer, body FROM manager_tokens WHERE contract = ? AND symbol = ?", [$contract, $symbol]);
    if ($existing && isset($existing["issuer"]) && $existing["issuer"] !== $issuer) {
        return [409, ["error" => "That ticker is already stored for another issuer."]];
    }
    $prev = null;
    if ($existing && !empty($existing["body"])) {
        $prev = parse_manager_token(json_decode($existing["body"], true));
    }
    $now = intval(round(microtime(true) * 1000));
    $created = $now;
    if ($prev && isset($prev["createdAt"])) {
        $created = intval($prev["createdAt"]);
    } elseif (isset($body["createdAt"])) {
        $created = intval($body["createdAt"]);
    }
    $body["createdAt"] = $created;
    $body["updatedAt"] = $now;
    db_run(
        $pdo,
        "INSERT INTO manager_tokens (contract, symbol, issuer, body, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE issuer = VALUES(issuer), body = VALUES(body), updated_at = VALUES(updated_at)",
        [$contract, $symbol, $issuer, json_encode($body, JSON_UNESCAPED_SLASHES), $now]
    );
    return [200, ["token" => $body]];
}
