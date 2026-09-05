<?php
// log_visit.php - Rozszerzony logger wizyt

error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

if (!file_exists('db_config.php')) {
    echo json_encode(['success' => false, 'error' => 'Brak db_config.php']);
    exit;
}

require_once 'db_config.php';

if (!isset($conn) || !$conn) {
    echo json_encode(['success' => false, 'error' => 'Brak połączenia z bazą']);
    exit;
}

// Pobierz dane z POST (z JavaScript) lub GET
$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
    // Fallback do GET
    $data = $_GET;
}

// Dane serwera
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
$referer = $_SERVER['HTTP_REFERER'] ?? 'direct';
$acceptLanguage = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? 'unknown';

// Dane z JavaScript
$page = $data['page'] ?? '/';
$screenResolution = $data['screen'] ?? 'Unknown';
$language = $data['lang'] ?? extractLanguage($acceptLanguage);
$timezone = $data['tz'] ?? 'Unknown';
$deviceType = $data['device'] ?? 'Unknown';
$timeOnPage = intval($data['time'] ?? 0);
$scrollDepth = intval($data['scroll'] ?? 0);

// Anonimizuj IP
$ipOriginal = $ip;
$ipParts = explode('.', $ip);
if (count($ipParts) === 4) {
    $ipParts[3] = '0';
    $ip = implode('.', $ipParts);
}

// Wykryj przeglądarkę
$browser = detectBrowser($userAgent);

// Wykryj OS
$os = detectOS($userAgent);

// Wykryj lokalizację i ISP przez ipinfo.io (darmowe API, 50k requestów/miesiąc)
$country = 'Unknown';
$city = 'Unknown';
$isp = 'Unknown';

try {
    // Użyj prostego API bez klucza (ograniczenie: 1000 req/dzień)
    $geoData = @file_get_contents("http://ip-api.com/json/{$ipOriginal}?fields=country,city,isp");
    if ($geoData) {
        $geo = json_decode($geoData, true);
        if ($geo && isset($geo['country'])) {
            $country = $geo['country'] ?? 'Unknown';
            $city = $geo['city'] ?? 'Unknown';
            $isp = $geo['isp'] ?? 'Unknown';
        }
    }
} catch (Exception $e) {
    // Ignoruj błędy geolokacji
}

$timestamp = date('Y-m-d H:i:s');

try {
    $tableCheck = $conn->query("SHOW TABLES LIKE 'visit_logs'");
    if (!$tableCheck || $tableCheck->num_rows === 0) {
        echo json_encode(['success' => false, 'error' => 'Tabela nie istnieje']);
        exit;
    }
    
    $stmt = $conn->prepare(
        "INSERT INTO visit_logs 
         (ip_anonymized, browser, os, referer, page, visit_date, country, city, isp, 
          screen_resolution, language, timezone, device_type, time_on_page, scroll_depth) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    
    if (!$stmt) {
        echo json_encode(['success' => false, 'error' => 'Błąd prepare: ' . $conn->error]);
        exit;
    }
    
    $stmt->bind_param(
        "sssssssssssssii", 
        $ip, $browser, $os, $referer, $page, $timestamp, $country, $city, $isp,
        $screenResolution, $language, $timezone, $deviceType, $timeOnPage, $scrollDepth
    );
    
    if ($stmt->execute()) {
        echo json_encode([
            'success' => true,
            'data' => [
                'ip' => $ip,
                'browser' => $browser,
                'os' => $os,
                'city' => $city,
                'isp' => $isp,
                'device' => $deviceType
            ]
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Błąd execute: ' . $stmt->error]);
    }
    
    $stmt->close();
    
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Exception: ' . $e->getMessage()]);
}

if (isset($conn)) {
    $conn->close();
}

// Funkcje pomocnicze
function detectBrowser($ua) {
    if (preg_match('/Edg/i', $ua)) return 'Edge';
    if (preg_match('/Chrome/i', $ua)) return 'Chrome';
    if (preg_match('/Firefox/i', $ua)) return 'Firefox';
    if (preg_match('/Safari/i', $ua)) return 'Safari';
    if (preg_match('/MSIE|Trident/i', $ua)) return 'IE';
    if (preg_match('/Opera|OPR/i', $ua)) return 'Opera';
    return 'Unknown';
}

function detectOS($ua) {
    if (preg_match('/Windows NT 10/i', $ua)) return 'Windows 10/11';
    if (preg_match('/Windows/i', $ua)) return 'Windows';
    if (preg_match('/Mac OS X/i', $ua)) return 'macOS';
    if (preg_match('/Linux/i', $ua)) return 'Linux';
    if (preg_match('/Android/i', $ua)) return 'Android';
    if (preg_match('/iOS|iPhone|iPad/i', $ua)) return 'iOS';
    return 'Unknown';
}

function extractLanguage($acceptLang) {
    if (preg_match('/^([a-z]{2})/i', $acceptLang, $matches)) {
        return strtolower($matches[1]);
    }
    return 'unknown';
}
?>