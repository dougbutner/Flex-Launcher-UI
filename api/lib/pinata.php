<?php

function handle_ipfs_pin($cfg)
{
    $jwt = trim($cfg["PINATA_JWT"]);
    if ($jwt === "") {
        return [503, ["error" => "PINATA_JWT is not set on the server."]];
    }
    if (!isset($_FILES["file"]) || !is_array($_FILES["file"])) {
        return [400, ["error" => 'Missing multipart field "file".']];
    }
    $file = $_FILES["file"];
    if (!empty($file["error"])) {
        return [400, ["error" => "Upload failed."]];
    }
    $tmp = $file["tmp_name"];
    $size = intval($file["size"]);
    $type = strtolower(isset($file["type"]) ? strval($file["type"]) : "");
    $name = isset($file["name"]) && $file["name"] ? strval($file["name"]) : "logo.png";
    if ($size < 1) {
        return [400, ["error" => "Empty file."]];
    }
    if ($size > 1048576) {
        return [400, ["error" => "File too large (max 1 MB)."]];
    }
    if ($type !== "image/png" && $type !== "image/svg+xml") {
        return [400, ["error" => "Use a square PNG or SVG."]];
    }
    $cfile = new CURLFile($tmp, $type, $name);
    $ch = curl_init("https://api.pinata.cloud/pinning/pinFileToIPFS");
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 45);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer " . $jwt]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, ["file" => $cfile]);
    $raw = curl_exec($ch);
    $code = intval(curl_getinfo($ch, CURLINFO_HTTP_CODE));
    curl_close($ch);
    $json = json_decode($raw, true);
    $hash = is_array($json) && isset($json["IpfsHash"]) ? strval($json["IpfsHash"]) : "";
    if ($code < 200 || $code >= 300 || $hash === "") {
        $err = "";
        if (is_array($json) && isset($json["error"])) {
            $err = is_array($json["error"]) && isset($json["error"]["details"]) ? strval($json["error"]["details"]) : strval($json["error"]);
        }
        return [502, ["error" => $err ? $err : "Pinata " . $code]];
    }
    $host = preg_replace('#^https?://#', "", rtrim($cfg["PINATA_GATEWAY"], "/"));
    return [200, ["cid" => $hash, "url" => "https://" . $host . "/ipfs/" . $hash]];
}
