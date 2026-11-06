<?php
// log_error.php - błędy strony zgłaszane z przeglądarek rodziców (script.js, ErrorReporter).
// Zapisujemy opis błędu, miejsce w kodzie, wersję strony oraz typ przeglądarki i systemu.
// Bez adresu IP i bez danych z formularzy. Ten sam błąd zwiększa licznik zamiast
// tworzyć nowy wiersz; podgląd w stats.php.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo '{"ok":false}';
    exit;
}

$data = json_decode((string)file_get_contents('php://input', false, null, 0, 8192), true);
if (!is_array($data) || !file_exists('db_config.php')) {
    http_response_code(400);
    echo '{"ok":false}';
    exit;
}

require_once 'db_config.php';
if (!isset($conn) || !$conn) {
    echo '{"ok":false}';
    exit;
}

function error_field($data, $key, $max) {
    $value = isset($data[$key]) && is_scalar($data[$key]) ? (string)$data[$key] : '';
    if (function_exists('mb_convert_encoding')) {
        $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
    }
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value);
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

function error_browser($ua) {
    if (preg_match('/SamsungBrowser/i', $ua)) return 'Samsung Internet';
    if (preg_match('/Edg/i', $ua)) return 'Edge';
    if (preg_match('/OPR|Opera/i', $ua)) return 'Opera';
    if (preg_match('/CriOS|Chrome/i', $ua)) return 'Chrome';
    if (preg_match('/FxiOS|Firefox/i', $ua)) return 'Firefox';
    if (preg_match('/Safari/i', $ua)) return 'Safari';
    return 'inna';
}

function error_os($ua) {
    if (preg_match('/iPhone|iPad|iPod/i', $ua)) return 'iOS';
    if (preg_match('/Android/i', $ua)) return 'Android';
    if (preg_match('/Windows/i', $ua)) return 'Windows';
    if (preg_match('/Mac OS X/i', $ua)) return 'macOS';
    if (preg_match('/Linux/i', $ua)) return 'Linux';
    return 'inny';
}

$kinds = ['blad', 'promise', 'obsluzony', 'komunikat'];
$kind = in_array($data['kind'] ?? '', $kinds, true) ? $data['kind'] : 'blad';
$message = trim(error_field($data, 'message', 300));
if ($message === '') {
    echo '{"ok":false}';
    exit;
}
$source = error_field($data, 'source', 120);
$line = max(0, min(1000000, (int)($data['line'] ?? 0)));
$col = max(0, min(100000, (int)($data['col'] ?? 0)));
$stack = error_field($data, 'stack', 1500);
$version = preg_replace('/[^\w-]/', '', error_field($data, 'version', 20));
$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
$browser = error_browser($ua);
$os = error_os($ua);
$width = (int)($data['width'] ?? 0);
$device = ($width > 0 && $width <= 768 ? 'telefon' : 'komputer') . (!empty($data['app']) ? ', aplikacja' : '');
$fingerprint = sha1($kind . '|' . $message . '|' . $source . '|' . $line);

try {
    $conn->query("CREATE TABLE IF NOT EXISTS js_errors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fingerprint CHAR(40) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        message VARCHAR(300) NOT NULL,
        source VARCHAR(120) NOT NULL DEFAULT '',
        line INT NOT NULL DEFAULT 0,
        col INT NOT NULL DEFAULT 0,
        stack TEXT,
        version VARCHAR(20) NOT NULL DEFAULT '',
        browser VARCHAR(30) NOT NULL DEFAULT '',
        os VARCHAR(30) NOT NULL DEFAULT '',
        device VARCHAR(30) NOT NULL DEFAULT '',
        occurrences INT NOT NULL DEFAULT 1,
        first_seen DATETIME NOT NULL,
        last_seen DATETIME NOT NULL,
        UNIQUE KEY fingerprint (fingerprint),
        KEY last_seen (last_seen)
    ) DEFAULT CHARSET=utf8mb4");

    // Stare wpisy (pół roku bez powtórzenia) usuwamy co jakiś czas
    if (mt_rand(1, 50) === 1) {
        $conn->query("DELETE FROM js_errors WHERE last_seen < DATE_SUB(NOW(), INTERVAL 180 DAY)");
    }

    // Nowych rodzajów błędów najwyżej 1000, żeby nikt nie zapchał bazy
    $exists = $conn->prepare("SELECT id FROM js_errors WHERE fingerprint = ?");
    $exists->bind_param('s', $fingerprint);
    $exists->execute();
    $known = $exists->get_result()->num_rows > 0;
    $exists->close();
    if (!$known) {
        $total = (int)$conn->query("SELECT COUNT(*) AS cnt FROM js_errors")->fetch_assoc()['cnt'];
        if ($total >= 1000) {
            echo '{"ok":false}';
            exit;
        }
    }

    $stmt = $conn->prepare("INSERT INTO js_errors
        (fingerprint, kind, message, source, line, col, stack, version, browser, os, device, occurrences, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE occurrences = occurrences + 1, last_seen = NOW(), version = VALUES(version),
            browser = VALUES(browser), os = VALUES(os), device = VALUES(device), stack = VALUES(stack)");
    $stmt->bind_param('ssssiisssss', $fingerprint, $kind, $message, $source, $line, $col, $stack, $version, $browser, $os, $device);
    $stmt->execute();
    $stmt->close();
    echo '{"ok":true}';
} catch (Exception $e) {
    error_log('log_error.php: ' . $e->getMessage());
    echo '{"ok":false}';
}

$conn->close();
