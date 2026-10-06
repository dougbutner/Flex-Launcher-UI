<?php

function db_schema_file()
{
    return dirname(__DIR__) . "/sql/schema.sql";
}

function db_run_sql_file(PDO $pdo, $file)
{
    if (!is_file($file)) {
        return;
    }
    $raw = file_get_contents($file);
    if ($raw === false || $raw === "") {
        return;
    }
    $buf = "";
    foreach (preg_split("/\r\n|\n|\r/", $raw) as $line) {
        $trim = trim($line);
        if ($trim === "" || strpos($trim, "--") === 0) {
            continue;
        }
        $buf .= $line . "\n";
        if (substr($trim, -1) === ";") {
            $stmt = trim(preg_replace("/;\\s*$/", "", $buf));
            $buf = "";
            if ($stmt !== "") {
                $pdo->exec($stmt);
            }
        }
    }
}

function db_ensure_schema(PDO $pdo)
{
    try {
        db_get($pdo, "SELECT id FROM site_settings WHERE id = 1");
        return;
    } catch (PDOException $e) {
        $code = strval($e->getCode());
        $msg = $e->getMessage();
        $missing = $code === "42S02" || strpos($msg, "42S02") !== false || stripos($msg, "doesn't exist") !== false;
        if (!$missing) {
            throw $e;
        }
    }
    db_run_sql_file($pdo, db_schema_file());
    $seed = dirname(__DIR__) . "/sql/data.sql";
    db_run_sql_file($pdo, $seed);
}

function db_connect($cfg)
{
    $host = $cfg["MYSQL_HOST"];
    $user = $cfg["MYSQL_USER"];
    $pass = $cfg["MYSQL_PASSWORD"];
    $name = $cfg["MYSQL_DATABASE"];
    $port = intval($cfg["MYSQL_PORT"]);
    if ($port < 1) {
        $port = 3306;
    }
    if ($host === "" || $user === "" || $name === "") {
        throw new RuntimeException("MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.");
    }
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    $hosts = $host === "localhost" ? [$host, "127.0.0.1"] : [$host];
    $last = "MySQL connection failed.";
    foreach ($hosts as $tryHost) {
        try {
            $pdo = new PDO("mysql:host=" . $tryHost . ";port=" . $port . ";dbname=" . $name . ";charset=utf8mb4", $user, $pass, $opts);
            db_ensure_schema($pdo);
            return $pdo;
        } catch (PDOException $e) {
            $last = trim(preg_replace("/\s+/", " ", $e->getMessage()));
        }
    }
    throw new RuntimeException("MySQL " . $last);
}

function db_all(PDO $pdo, $sql, $params = [])
{
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll();
    return $rows ? $rows : [];
}

function db_get(PDO $pdo, $sql, $params = [])
{
    $rows = db_all($pdo, $sql, $params);
    return isset($rows[0]) ? $rows[0] : null;
}

function db_run(PDO $pdo, $sql, $params = [])
{
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return ["affectedRows" => $st->rowCount(), "insertId" => intval($pdo->lastInsertId())];
}
