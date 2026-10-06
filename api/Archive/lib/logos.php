<?php

function logo_root()
{
    return dirname(__DIR__) . "/logos";
}

function logo_cid_ok($cid)
{
    return (bool) preg_match('/^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{20,80})$/', $cid);
}

function logo_match($path)
{
    if (!preg_match('#^/api/logo/([a-z1-5.]{1,12})/([A-Za-z]{1,7})-([A-Za-z0-9]+)$#', $path, $m)) {
        return null;
    }
    $contract = strtolower($m[1]);
    $symbol = strtoupper($m[2]);
    $cid = $m[3];
    if (!valid_account($contract) || !valid_symbol($symbol) || !logo_cid_ok($cid)) {
        return null;
    }
    return ["contract" => $contract, "symbol" => $symbol, "cid" => $cid];
}

function logo_guard()
{
    $root = logo_root();
    if (!is_dir($root)) {
        mkdir($root, 0755, true);
    }
    return $root;
}

function logo_types()
{
    return [
        "png" => "image/png",
        "jpg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
    ];
}

function logo_sniff($bytes)
{
    if (!is_string($bytes) || $bytes === "") {
        return "";
    }
    if (strncmp($bytes, "\x89PNG\r\n\x1a\n", 8) === 0) {
        return "png";
    }
    if (strncmp($bytes, "\xFF\xD8\xFF", 3) === 0) {
        return "jpg";
    }
    if (strncmp($bytes, "GIF87a", 6) === 0 || strncmp($bytes, "GIF89a", 6) === 0) {
        return "gif";
    }
    if (strlen($bytes) >= 12 && substr($bytes, 0, 4) === "RIFF" && substr($bytes, 8, 4) === "WEBP") {
        return "webp";
    }
    $head = ltrim(substr($bytes, 0, 512));
    if (stripos($head, "<svg") === 0 && stripos($bytes, "<script") === false) {
        return "svg";
    }
    return "";
}

function logo_find($contract, $symbol, $cid)
{
    if (!logo_cid_ok($cid)) {
        return null;
    }
    $dir = logo_root() . "/" . $contract;
    if (!is_dir($dir)) {
        return null;
    }
    foreach (logo_types() as $ext => $type) {
        $path = $dir . "/" . $symbol . "-" . $cid . "." . $ext;
        if (is_file($path)) {
            return ["path" => $path, "type" => $type];
        }
    }
    return null;
}

function logo_public_ip($ip)
{
    return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}

function logo_url_ok($url)
{
    $parts = parse_url($url);
    if (!is_array($parts) || empty($parts["scheme"]) || empty($parts["host"])) {
        return false;
    }
    if (!empty($parts["user"]) || !empty($parts["pass"])) {
        return false;
    }
    $scheme = strtolower($parts["scheme"]);
    if ($scheme !== "http" && $scheme !== "https") {
        return false;
    }
    $host = strtolower($parts["host"]);
    if ($host === "localhost" || substr($host, -6) === ".local") {
        return false;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return logo_public_ip($host);
    }
    $ips = @gethostbynamel($host);
    if (!$ips) {
        return false;
    }
    foreach ($ips as $ip) {
        if (!logo_public_ip($ip)) {
            return false;
        }
    }
    return true;
}

function logo_plain($contract, $symbol)
{
    if (!valid_account($contract) || !valid_symbol($symbol)) {
        return null;
    }
    $dir = logo_root() . "/" . $contract;
    if (!is_dir($dir)) {
        return null;
    }
    foreach (logo_types() as $ext => $type) {
        $path = $dir . "/" . $symbol . "." . $ext;
        if (is_file($path)) {
            return ["path" => $path, "type" => $type, "ext" => $ext];
        }
    }
    return null;
}

function logo_remote_ok($url, $contract, $symbol, $cid)
{
    $alcor = "https://raw.githubusercontent.com/alcorexchange/alcor-ui/master/assets/tokens/proton/" . strtolower($symbol) . "_" . strtolower($contract) . ".png";
    $drops = "https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/logos/" . strtolower($symbol) . "-" . strtolower($contract) . ".png";
    if ($url === $alcor || $url === $drops) {
        return true;
    }
    return $cid !== "" && logo_cid_ok($cid) && strpos($url, $cid) !== false;
}

function logo_write($contract, $symbol, $cid, $bytes)
{
    $ext = logo_sniff($bytes);
    if (!valid_account($contract) || !valid_symbol($symbol) || ($cid !== "" && !logo_cid_ok($cid)) || $ext === "" || strlen($bytes) > 1048576) {
        return null;
    }
    $root = logo_guard();
    $dir = $root . "/" . $contract;
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $plain = $dir . "/" . $symbol . "." . $ext;
    $tmp = $dir . "/." . $symbol . ".download";
    if (file_put_contents($tmp, $bytes) === false) {
        return null;
    }
    rename($tmp, $plain);
    if ($cid !== "") {
        $dest = $dir . "/" . $symbol . "-" . $cid . "." . $ext;
        $cidTmp = $dir . "/." . $symbol . "-" . $cid . ".download";
        if (file_put_contents($cidTmp, $bytes) !== false) {
            rename($cidTmp, $dest);
        }
    }
    return ["path" => $plain, "type" => logo_types()[$ext], "ext" => $ext];
}

function logo_publish($cfg, $contract, $symbol, $path)
{
    $token = isset($cfg["GITHUB_TOKEN"]) ? trim(strval($cfg["GITHUB_TOKEN"])) : "";
    if ($token === "" || !is_file($path)) {
        return;
    }
    $mark = logo_root() . "/" . $contract . "/." . $symbol . ".github";
    if (is_file($mark)) {
        return;
    }
    $ext = pathinfo($path, PATHINFO_EXTENSION);
    $rel = "public/tokens/" . $contract . "/" . $symbol . "." . $ext;
    $content = base64_encode(file_get_contents($path));
    try {
        $got = gh($token, "GET", "/repos/dougbutner/Flex-Launcher-UI/contents/" . $rel . "?ref=main");
        $sha = "";
        if ($got["ok"] && isset($got["json"]["content"]) && str_replace("\n", "", strval($got["json"]["content"])) === $content) {
            file_put_contents($mark, "1");
            return;
        }
        if ($got["ok"] && isset($got["json"]["sha"])) {
            $sha = strval($got["json"]["sha"]);
        } elseif ($got["status"] !== 404) {
            return;
        }
        $payload = ["message" => "Add " . $symbol . " logo", "content" => $content, "branch" => "main"];
        if ($sha !== "") {
            $payload["sha"] = $sha;
        }
        $put = gh($token, "PUT", "/repos/dougbutner/Flex-Launcher-UI/contents/" . $rel, $payload);
        if ($put["ok"]) {
            file_put_contents($mark, "1");
        }
    } catch (Exception $e) {
        /* quiet */
    }
}

function logo_fetch_save($contract, $symbol, $cid, $url)
{
    $plain = logo_plain($contract, $symbol);
    if ($plain) {
        return $plain;
    }
    $existing = $cid !== "" ? logo_find($contract, $symbol, $cid) : null;
    if ($existing) {
        $bytes = file_get_contents($existing["path"]);
        return is_string($bytes) ? logo_write($contract, $symbol, "", $bytes) : null;
    }
    $url = trim($url);
    if ($url === "" || !logo_remote_ok($url, $contract, $symbol, $cid) || !logo_url_ok($url)) {
        return null;
    }
    $root = logo_guard();
    $dir = $root . "/" . $contract;
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    $tmp = $dir . "/." . $symbol . "-" . $cid . ".download";
    $out = fopen($tmp, "wb");
    if ($out === false) {
        return null;
    }
    $written = 0;
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
    curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
    curl_setopt($ch, CURLOPT_USERAGENT, "FlexLauncher/1.0");
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $data) use (&$written, $out) {
        $n = strlen($data);
        $written += $n;
        if ($written > 1048576) {
            return 0;
        }
        fwrite($out, $data);
        return $n;
    });
    $ok = curl_exec($ch);
    $ip = strval(curl_getinfo($ch, CURLINFO_PRIMARY_IP));
    $code = intval(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    $final = strval(curl_getinfo($ch, CURLINFO_EFFECTIVE_URL));
    curl_close($ch);
    fclose($out);
    $bytes = $ok !== false && $code >= 200 && $code < 300 && logo_public_ip($ip) && logo_remote_ok($final, $contract, $symbol, $cid) ? file_get_contents($tmp) : false;
    @unlink($tmp);
    if (!is_string($bytes)) {
        return null;
    }
    return logo_write($contract, $symbol, $cid, $bytes);
}

function logo_send($cfg, $contract, $symbol, $cid, $url)
{
    try {
        $file = logo_find($contract, $symbol, $cid);
        if (!$file && $url !== "") {
            $file = logo_fetch_save($contract, $symbol, $cid, $url);
        }
        if ($file) {
            logo_publish($cfg, $contract, $symbol, $file["path"]);
        }
        if (!$file) {
            send_json(404, ["error" => "Missing logo."]);
            return;
        }
        header("Content-Type: " . $file["type"]);
        header("Cache-Control: public, max-age=86400");
        header("X-Content-Type-Options: nosniff");
        header("Content-Security-Policy: default-src 'none'");
        header("Content-Length: " . filesize($file["path"]));
        readfile($file["path"]);
    } catch (Exception $e) {
        send_json(404, ["error" => "Missing logo."]);
    }
}

function logo_save($cfg)
{
    try {
        $contract = "";
        $symbol = "";
        $cid = "";
        $bytes = "";
        $url = "";
        if (isset($_FILES["file"]) && is_array($_FILES["file"]) && empty($_FILES["file"]["error"])) {
            $contract = strtolower(trim(isset($_POST["contract"]) ? strval($_POST["contract"]) : ""));
            $symbol = strtoupper(trim(isset($_POST["symbol"]) ? strval($_POST["symbol"]) : ""));
            $cid = trim(isset($_POST["cid"]) ? strval($_POST["cid"]) : "");
            $raw = file_get_contents($_FILES["file"]["tmp_name"]);
            $bytes = is_string($raw) ? $raw : "";
        } else {
            $body = json_input();
            $contract = strtolower(trim(isset($body["contract"]) ? strval($body["contract"]) : ""));
            $symbol = strtoupper(trim(isset($body["symbol"]) ? strval($body["symbol"]) : ""));
            $cid = trim(isset($body["cid"]) ? strval($body["cid"]) : "");
            $url = trim(isset($body["url"]) ? strval($body["url"]) : "");
        }
        $saved = null;
        if ($bytes !== "") {
            $saved = logo_write($contract, $symbol, $cid, $bytes);
        } elseif ($url !== "") {
            $saved = logo_fetch_save($contract, $symbol, $cid, $url);
        }
        if ($saved) {
            logo_publish($cfg, $contract, $symbol, $saved["path"]);
        }
    } catch (Exception $e) {
        /* quiet */
    }
    send_json(204, []);
}
