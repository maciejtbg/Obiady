<?php
// convert.php - Konwersja pliku DOC/DOCX na tabelę jadłospisu i zapis do bazy danych
//
// STRATEGIA:
// 1. Dla plików .docx (Word 2007+, obecny format jadłospisu z tabelami tygodniowymi)
//    próbujemy najpierw sparsować dokument LOKALNIE (bez zewnętrznego API), czytając
//    bezpośrednio tabele z pliku .docx (ZipArchive + DOMDocument). Dzięki temu wynik
//    nie zależy od tego, jak zewnętrzne API "spłaszczy" tabelę do zwykłego tekstu.
//    Zwracamy wtedy ustrukturyzowany JSON: {"Successful":true,"Format":"table","Days":[...]}
// 2. Jeśli lokalny parser się nie powiedzie (stary format pliku, brak rozszerzeń PHP
//    zip/dom na serwerze, plik .doc w starym binarnym formacie itp.) - używamy jak
//    dawniej zewnętrznego API Cloudmersive do konwersji na czysty tekst i zwracamy
//    {"Successful":true,"TextResult":"..."} - dokładnie jak wcześniej.

// Nagłówki CORS - muszą być na samym początku
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Sprawdzenie czy plik db_config.php istnieje
$dbConfigExists = file_exists('db_config.php');
if ($dbConfigExists) {
    require_once 'db_config.php';
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode([
        'Successful' => false,
        'Error' => 'Plik nie został przesłany lub wystąpił błąd podczas przesyłania.'
    ]);
    exit;
}

$tmpFile = $_FILES['file']['tmp_name'];
$filename = $_FILES['file']['name'];

// Klucz API Cloudmersive (uzywany tylko jako fallback, patrz wyzej) wczytywany
// ze zmiennej srodowiskowej lub pliku cloudmersive_config.php (NIE trzymamy go w kodzie)
$apiKey = getenv('CLOUDMERSIVE_API_KEY');
if (!$apiKey && file_exists(__DIR__ . '/cloudmersive_config.php')) {
    $cmConfig = include __DIR__ . '/cloudmersive_config.php';
    $apiKey = $cmConfig['cloudmersive_api_key'] ?? null;
}
if (!$apiKey) {
    echo json_encode([
        'Successful' => false,
        'Error' => 'Brak skonfigurowanego klucza API Cloudmersive. Ustaw zmienna srodowiskowa CLOUDMERSIVE_API_KEY lub plik cloudmersive_config.php.'
    ]);
    exit;
}

// Wykrycie rozszerzenia pliku
$ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
if ($ext !== 'doc' && $ext !== 'docx') {
    echo json_encode([
        'Successful' => false,
        'Error' => 'Nieobsługiwany format pliku. Przesyłaj tylko pliki DOC lub DOCX.'
    ]);
    exit;
}

// -------------------------------------------------------------
// KROK 1: Spróbuj sparsować jadłospis lokalnie z tabel w .docx
// -------------------------------------------------------------
if ($ext === 'docx') {
    $tableResult = parseMenuDocxTables($tmpFile);
    if ($tableResult !== null) {
        $jsonResult = json_encode($tableResult, JSON_UNESCAPED_UNICODE);
        echo $jsonResult;
        saveConversionToHistory($dbConfigExists, $filename, $jsonResult);
        exit;
    }
    // Jeśli się nie udało (np. plik bez tabel, stary układ jadłospisu) -
    // lecimy dalej do konwersji przez Cloudmersive jako plain text.
}

if ($ext === 'doc') {
    $url = "https://api.cloudmersive.com/convert/doc/to/txt";
} else {
    $url = "https://api.cloudmersive.com/convert/docx/to/txt";
}

// Przygotowanie zapytania cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);

// Przygotowanie pliku do wysłania
$cFile = curl_file_create($tmpFile, $_FILES['file']['type'], $filename);
$postData = ['inputFile' => $cFile];
curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);

// Dodanie nagłówka z kluczem API
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Apikey: $apiKey"
]);

// Wykonanie zapytania
$response = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Obsługa błędów cURL
if ($curlError) {
    echo json_encode([
        'Successful' => false,
        'Error' => 'Błąd cURL: ' . $curlError
    ]);
    exit;
}

// Sprawdzenie czy API zwróciło sukces
if ($httpCode !== 200) {
    echo json_encode([
        'Successful' => false,
        'Error' => 'API zwróciło błąd (kod: ' . $httpCode . ')'
    ]);
    exit;
}

// Przekonwertowany tekst
$textResult = $response;

// Przygotowanie JSONa do zwrócenia
$jsonResult = json_encode([
    'Successful' => true,
    'TextResult' => $textResult
], JSON_UNESCAPED_UNICODE);

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

/**
 * Próbuje sparsować jadłospis bezpośrednio z tabel w pliku .docx (bez
 * żadnego zewnętrznego API). Zwraca tablicę gotową do json_encode w postaci:
 *   ['Successful' => true, 'Format' => 'table', 'Days' => [
 *       ['date' => '07.09', 'dayName' => 'PONIEDZIAŁEK', 'zupa' => '...',
 *        'drugieDanie' => '...', 'deser' => '...', 'alergeny' => '7,9'],
 *       ...
 *   ]]
 * Zwraca null, jeśli parsowanie się nie powiodło (np. brak potrzebnych
 * rozszerzeń PHP na serwerze albo dokument nie zawiera tabel jadłospisu) -
 * w takim wypadku convert.php przechodzi do starej ścieżki z Cloudmersive.
 */
function parseMenuDocxTables($tmpFilePath) {
    if (!class_exists('ZipArchive') || !class_exists('DOMDocument')) {
        // Serwer nie ma rozszerzeń zip/dom - nie da się parsować lokalnie
        return null;
    }

    $zip = new ZipArchive();
    if ($zip->open($tmpFilePath) !== true) {
        return null; // to nie jest poprawny plik .docx (zip)
    }

    $xml = $zip->getFromName('word/document.xml');
    $zip->close();

    if ($xml === false) {
        return null;
    }

    $dom = new DOMDocument();
    // Zabezpieczenie przed XXE: nie rozwijamy zewnętrznych encji z przesłanego pliku.
    if (function_exists('libxml_disable_entity_loader')) {
        @libxml_disable_entity_loader(true);
    }
    $previousErrorSetting = libxml_use_internal_errors(true);
    $loaded = @$dom->loadXML($xml, LIBXML_NONET);
    libxml_use_internal_errors($previousErrorSetting);
    if (!$loaded) {
        return null;
    }

    $xpath = new DOMXPath($dom);
    $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');

    $tables = $xpath->query('//w:tbl');
    if ($tables === false || $tables->length === 0) {
        return null;
    }

    // Rozpoznaje datę + (opcjonalnie) nazwę dnia w pierwszej kolumnie, np.
    // "PONIEDZIAŁEK 07.09" albo samo "07.09"
    $dateRe = '/([A-ZĄĆĘŁŃÓŚŹŻ]+)?\s*(\d{1,2})\.(\d{1,2})/ui';

    $days = [];
    $prices = [];

    foreach ($tables as $table) {
        $rows = $xpath->query('.//w:tr', $table);

        // Sprawdź, czy to tabela cennika (Wariant / Gramatura / Cena) -
        // jeśli tak, wyciągnij z niej ceny zamiast dni jadłospisu.
        if ($rows->length > 0) {
            $firstRowCells = $xpath->query('./w:tc', $rows->item(0));
            $firstRowTexts = [];
            foreach ($firstRowCells as $c) {
                $firstRowTexts[] = mb_strtoupper(extractDocxCellText($xpath, $c), 'UTF-8');
            }
            $firstRowJoined = implode(' ', $firstRowTexts);
            if (strpos($firstRowJoined, 'WARIANT') !== false && strpos($firstRowJoined, 'CENA') !== false) {
                for ($i = 1; $i < $rows->length; $i++) {
                    $cells = $xpath->query('./w:tc', $rows->item($i));
                    $texts = [];
                    foreach ($cells as $c) {
                        $texts[] = extractDocxCellText($xpath, $c);
                    }
                    if (count($texts) < 3) continue;
                    $label = mb_strtolower(trim($texts[0]), 'UTF-8');
                    $price = parsePolishPrice($texts[count($texts) - 1]);
                    if ($price === null) continue;
                    if (strpos($label, 'zestaw') !== false) {
                        $prices['zestaw'] = $price;
                    } elseif (strpos($label, 'zupa') !== false) {
                        $prices['zupa'] = $price;
                    } elseif (strpos($label, 'danie') !== false) {
                        $prices['drugie'] = $price;
                    }
                }
                continue; // nie traktuj tej tabeli jako tabeli dni
            }
        }

        foreach ($rows as $rowIndex => $row) {
            $cells = $xpath->query('./w:tc', $row);
            if ($cells->length === 0) {
                continue;
            }

            $cellTexts = [];
            foreach ($cells as $cell) {
                $cellTexts[] = extractDocxCellText($xpath, $cell);
            }

            // Wykryj wiersz nagłówka tabeli (DZIEŃ / ZUPA / DRUGIE DANIE... / DESER / ALERGENY)
            $joined = mb_strtoupper(implode(' ', $cellTexts), 'UTF-8');
            if (strpos($joined, 'ZUPA') !== false && strpos($joined, 'ALERGEN') !== false) {
                continue; // to jest nagłówek, nie dzień
            }

            $firstCell = trim($cellTexts[0] ?? '');
            if ($firstCell === '') {
                continue; // pusty wiersz (np. odstęp na początku tabeli)
            }

            if (!preg_match($dateRe, $firstCell, $m)) {
                continue; // wiersz bez rozpoznawalnej daty - pomijamy
            }

            $dayName = trim($m[1] ?? '');
            $day = str_pad($m[2], 2, '0', STR_PAD_LEFT);
            $month = str_pad($m[3], 2, '0', STR_PAD_LEFT);

            // Domyślne przypisanie kolumn: DZIEŃ, ZUPA, DRUGIE DANIE + DODATKI, DESER, ALERGENY
            $zupa = trim($cellTexts[1] ?? '');
            $drugieDanie = trim($cellTexts[2] ?? '');
            $deser = trim($cellTexts[3] ?? '');
            $alergeny = trim($cellTexts[4] ?? '');

            $days[] = [
                'date' => "$day.$month",
                'dayName' => $dayName,
                'zupa' => $zupa,
                'drugieDanie' => $drugieDanie,
                'deser' => $deser,
                'alergeny' => $alergeny,
            ];
        }
    }

    if (empty($days)) {
        return null; // nie znaleziono ani jednego wiersza z dniem - to nie jest ten format
    }

    $result = [
        'Successful' => true,
        'Format' => 'table',
        'Days' => $days,
    ];
    if (!empty($prices)) {
        $result['Prices'] = $prices;
    }
    return $result;
}

/**
 * Zamienia polski zapis ceny (np. "18,00 zł", "23,50zł") na liczbę float.
 * Zwraca null, jeśli tekst nie wygląda na cenę.
 */
function parsePolishPrice($text) {
    $text = str_ireplace(['zł', 'pln'], '', $text);
    $text = trim($text);
    $text = str_replace(' ', '', $text);
    $text = str_replace(',', '.', $text);
    if (!preg_match('/^\d+(\.\d+)?$/', $text)) {
        return null;
    }
    return (float) $text;
}

/**
 * Wyciąga tekst z komórki tabeli (w:tc), zamieniając miękkie złamania
 * wiersza (w:br) na " | ", żeby dało się rozdzielić np. danie główne
 * od dodatków w jednej komórce.
 */
function extractDocxCellText($xpath, $cell) {
    $parts = [];
    $paragraphs = $xpath->query('.//w:p', $cell);

    foreach ($paragraphs as $p) {
        $paraText = '';
        foreach ($p->childNodes as $node) {
            walkDocxRunNode($node, $paraText);
        }
        $paraText = trim($paraText);
        if ($paraText !== '') {
            $parts[] = $paraText;
        }
    }

    return implode(' | ', $parts);
}

function walkDocxRunNode($node, &$text) {
    if ($node->nodeType !== XML_ELEMENT_NODE) {
        return;
    }
    $localName = $node->localName;

    if ($localName === 't') {
        $text .= $node->textContent;
    } elseif ($localName === 'br' || $localName === 'tab') {
        $text .= ' | ';
    } elseif ($localName === 'r' || $localName === 'hyperlink' || $localName === 'ins') {
        foreach ($node->childNodes as $child) {
            walkDocxRunNode($child, $text);
        }
    }
}
?>