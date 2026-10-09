<?php
// convert.php - przyjmuje plik jadłospisu i zwraca dni z daniami dla script.js
//
// Rozpoznawanie formatu i układu pliku jest w menu_parser.php (DOCX, tekst,
// tabele z PDF i OCR), a konwersje przez usługi zewnętrzne (DOC, PDF, skany,
// zdjęcia) w menu_services.php. Wynik dla tego samego pliku zapamiętujemy
// w cache/, bo zwykle wszyscy rodzice wgrywają ten sam jadłospis, a darmowe
// usługi mają miesięczne limity.

// Nagłówki CORS - muszą być na samym początku
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/menu_services.php';

// Sprawdzenie czy plik db_config.php istnieje
$dbConfigExists = file_exists('db_config.php');
if ($dbConfigExists) {
    require_once 'db_config.php';
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode([
        'Successful' => false,
        'Error' => 'Plik nie został przesłany lub wystąpił błąd podczas przesyłania.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$tmpFile = $_FILES['file']['tmp_name'];
$filename = $_FILES['file']['name'];

// Zmiana tej wersji unieważnia zapamiętane wyniki po poprawkach parsera
const MENU_CACHE_VERSION = 'v3';
$cacheDir = __DIR__ . '/cache';
$cacheFile = $cacheDir . '/' . sha1_file($tmpFile) . '-' . MENU_CACHE_VERSION . '.json';

if (is_file($cacheFile)) {
    $jsonResult = file_get_contents($cacheFile);
    echo $jsonResult;
    saveConversionToHistory($dbConfigExists, $filename, $jsonResult);
    exit;
}

$conversion = ms_convert_menu($tmpFile, ms_load_keys());

if ($conversion['result'] !== null) {
    $jsonResult = json_encode($conversion['result'], JSON_UNESCAPED_UNICODE);
    if (is_dir($cacheDir) || @mkdir($cacheDir, 0755)) {
        if (!is_file($cacheDir . '/.htaccess')) {
            @file_put_contents($cacheDir . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
        }
        @file_put_contents($cacheFile, $jsonResult);
    }
} elseif ($conversion['legacyText'] !== null) {
    // Ostatnia deska ratunku: surowy tekst rozpozna stary parser w script.js
    $jsonResult = json_encode(['Successful' => true, 'TextResult' => $conversion['legacyText']], JSON_UNESCAPED_UNICODE);
} else {
    // Log: kolejne próby konwersji (bez kluczy), widoczne w trybie debugowania strony
    echo json_encode(['Successful' => false, 'Error' => $conversion['error'], 'Log' => $conversion['log']], JSON_UNESCAPED_UNICODE);
    exit;
}

// Zwróć wynik konwersji do frontendu
echo $jsonResult;

// Zapis do bazy danych (tylko jeśli db_config.php istnieje)
saveConversionToHistory($dbConfigExists, $filename, $jsonResult);

// =================================================================
// FUNKCJE POMOCNICZE
// =================================================================

/**
 * Zapisuje wynik konwersji (pełny JSON) do tabeli menu_history,
 * dokładnie tak samo niezależnie od tego, czy wynik pochodzi
 * z lokalnego parsera tabel, czy z Cloudmersive.
 */
function saveConversionToHistory($dbConfigExists, $filename, $jsonResult) {
    global $conn;

    if (!$dbConfigExists || !isset($conn) || !$conn) {
        return;
    }

    try {
        $tableCheck = $conn->query("SHOW TABLES LIKE 'menu_history'");

        if ($tableCheck && $tableCheck->num_rows > 0) {
            $stmt = $conn->prepare("INSERT INTO menu_history (filename, converted_text) VALUES (?, ?)");

            if ($stmt !== false) {
                // WAŻNE: Zapisujemy cały JSON (nie tylko sam tekst) bo parseMenu()
                // w script.js oczekuje pełnego obiektu (Successful + Format/Days lub TextResult)
                $stmt->bind_param("ss", $filename, $jsonResult);

                if (!$stmt->execute()) {
                    error_log('Błąd zapisu do bazy: ' . $stmt->error);
                }

                $stmt->close();
            }
        }
    } catch (Exception $e) {
        error_log('Błąd zapisu do bazy: ' . $e->getMessage());
    }

    $conn->close();
    $conn = null;
}
