<?php

function db_connect($cfg)
{
    $host = $cfg["MYSQL_HOST"];
    $user = $cfg["MYSQL_USER"];
    $pass = $cfg["MYSQL_PASSWORD"];
    $name = $cfg["MYSQL_DATABASE"];
    $port = intval($cfg["MYSQL_PORT"]);
    if ($host === "" || $user === "" || $name === "") {
        throw new RuntimeException("MySQL is not configured. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE.");
    }
    $dsn = "mysql:host=" . $host . ";port=" . $port . ";dbname=" . $name . ";charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
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
