<?php
// menu_services.php - zamiana pliku jadłospisu (DOCX, DOC, PDF, skan, zdjęcie, TXT)
// na tabelę dni, z użyciem usług zewnętrznych tylko tam, gdzie są potrzebne:
//   - Cloudmersive (klucz już używany przez aplikację): DOC -> DOCX, PDF -> DOCX, PDF -> TXT
//   - OCR.space (darmowy klucz, opcjonalnie): skany PDF i zdjęcia jadłospisu
// Każda kolejna metoda jest próbowana tylko wtedy, gdy poprzednia nie dała wyniku.

require_once __DIR__ . '/menu_parser.php';

// Klucze z plików konfiguracyjnych (poza repozytorium) albo ze zmiennych środowiskowych
function ms_load_keys() {
    $keys = ['cloudmersive' => getenv('CLOUDMERSIVE_API_KEY') ?: null, 'ocr_space' => getenv('OCR_SPACE_API_KEY') ?: null];
    if (!$keys['cloudmersive'] && file_exists(__DIR__ . '/cloudmersive_config.php')) {
        $config = include __DIR__ . '/cloudmersive_config.php';
        $keys['cloudmersive'] = $config['cloudmersive_api_key'] ?? null;
    }
    if (!$keys['ocr_space'] && file_exists(__DIR__ . '/ocr_config.php')) {
        $config = include __DIR__ . '/ocr_config.php';
        $keys['ocr_space'] = $config['ocr_space_api_key'] ?? null;
    }
    return $keys;
}

function ms_http_post($url, array $fields, array $headers, &$error) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $fields,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 90,
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    if ($curlError || $code !== 200 || $body === false) {
        $error = $curlError ?: 'HTTP ' . $code;
        return null;
    }
    return $body;
}

// Konwersja Cloudmersive zwracająca plik (np. DOCX); wynik zapisany do pliku tymczasowego
function ms_cloudmersive_file($endpoint, $path, $name, $apiKey, &$error) {
    $body = ms_http_post('https://api.cloudmersive.com' . $endpoint, ['inputFile' => new CURLFile($path, 'application/octet-stream', $name)], ["Apikey: $apiKey"], $error);
    if ($body === null) return null;
    if (strncmp($body, 'PK', 2) !== 0) {
        $error = 'odpowiedź nie jest plikiem DOCX';
        return null;
    }
    $target = tempnam(sys_get_temp_dir(), 'menu');
    file_put_contents($target, $body);
    return $target;
}

// Konwersja Cloudmersive do tekstu (odpowiedź JSON z polem TextResult)
function ms_cloudmersive_text($endpoint, $path, $name, $apiKey, &$error, array $headers = []) {
    $body = ms_http_post('https://api.cloudmersive.com' . $endpoint, ['inputFile' => new CURLFile($path, 'application/octet-stream', $name)], array_merge(["Apikey: $apiKey"], $headers), $error);
    if ($body === null) return null;
    $json = json_decode($body, true);
    if (is_array($json) && isset($json['TextResult'])) return (string) $json['TextResult'];
    return $body;
}

// Zdjęcie większe niż limit OCR.space (1 MB) zmniejszamy, jeśli serwer ma GD
function ms_shrink_image($path, $type) {
    if (filesize($path) <= 1000000 || !function_exists('imagecreatefromstring')) return $path;
    $image = @imagecreatefromstring(file_get_contents($path));
    if (!$image) return $path;
    $width = imagesx($image);
    $height = imagesy($image);
    $scale = min(1, 2000 / max($width, $height));
    $resized = imagecreatetruecolor((int) ($width * $scale), (int) ($height * $scale));
    imagecopyresampled($resized, $image, 0, 0, 0, 0, imagesx($resized), imagesy($resized), $width, $height);
    $target = tempnam(sys_get_temp_dir(), 'ocr') . '.jpg';
    for ($quality = 85; $quality >= 45; $quality -= 10) {
        imagejpeg($resized, $target, $quality);
        clearstatcache(true, $target);
        if (filesize($target) <= 1000000) break;
    }
    imagedestroy($image);
    imagedestroy($resized);
    return $target;
}

// OCR.space: tekst ze skanu PDF albo zdjęcia (isTable zachowuje wiersze tabeli)
function ms_ocr_space($path, $type, $apiKey, &$error, &$note = null) {
    $fileType = ['pdf' => 'PDF', 'jpg' => 'JPG', 'png' => 'PNG'][$type] ?? null;
    if ($fileType === null) {
        $error = 'nieobsługiwany typ pliku';
        return null;
    }
    if ($type !== 'pdf') {
        $path = ms_shrink_image($path, $type);
        if (filesize($path) > 1000000) $fileType = 'JPG';
    }
    if (filesize($path) > 1000000) {
        $error = 'plik większy niż 1 MB (limit darmowego OCR)';
        return null;
    }
    $fields = [
        'file' => new CURLFile($path, $fileType === 'PDF' ? 'application/pdf' : 'image/' . strtolower($fileType), 'menu.' . strtolower($fileType)),
        'filetype' => $fileType,
        'language' => 'pol',
        'isTable' => 'true',
        'isOverlayRequired' => 'true',
        'scale' => 'true',
        'OCREngine' => '2',
    ];
    $body = ms_http_post('https://api.ocr.space/parse/image', $fields, ["apikey: $apiKey"], $error);
    if ($body === null) return null;
    $json = json_decode($body, true);
    $message = is_array($json) ? ($json['ErrorMessage'] ?? '') : 'zła odpowiedź';
    $message = is_array($message) ? implode(' ', $message) : (string) $message;
    if (!is_array($json) || empty($json['ParsedResults'])) {
        $error = $message !== '' ? $message : 'brak wyniku';
        return null;
    }
    // Przy limicie stron darmowy OCR zwraca błąd, ale i tak odczytuje pierwsze strony
    if (!empty($json['IsErroredOnProcessing']) && stripos($message, 'page limit') !== false) {
        $note = 'Odczytano tylko pierwsze 3 strony skanu (limit darmowego OCR). Jeśli jadłospis jest dłuższy, wgraj go w częściach albo jako zdjęcia.';
    }
    $text = '';
    foreach ($json['ParsedResults'] as $page) {
        $layout = ms_overlay_to_text($page['TextOverlay']['Lines'] ?? []);
        $text .= ($layout !== '' ? $layout : ($page['ParsedText'] ?? '')) . "\n";
    }
    return $text;
}

// Współrzędne słów z OCR zamieniamy na tekst, w którym słowo stoi w kolumnie
// odpowiadającej jego położeniu na stronie. Dzięki temu tabelę z zawiniętymi
// komórkami odczytuje ten sam kod co tekst z PDF (mp_parse_fixed_width).
function ms_overlay_to_text(array $lines) {
    $words = [];
    $widths = [];
    $heights = [];
    foreach ($lines as $line) {
        foreach ($line['Words'] ?? [] as $word) {
            if (!isset($word['WordText'], $word['Left'], $word['Top'])) continue;
            $words[] = $word;
            $length = mb_strlen($word['WordText'], 'UTF-8');
            if ($length >= 3 && !empty($word['Width'])) $widths[] = $word['Width'] / $length;
            if (!empty($word['Height'])) $heights[] = $word['Height'];
        }
    }
    if (!$widths) return '';
    $median = function (array $values) {
        sort($values);
        return $values[(int) (count($values) / 2)];
    };
    $charWidth = max(1, $median($widths));
    $rowTolerance = max(2, ($heights ? $median($heights) : 10) * 0.5);

    // Słowa o podobnej wysokości na stronie tworzą jeden wiersz
    usort($words, function ($a, $b) { return $a['Top'] <=> $b['Top']; });
    $rows = [];
    foreach ($words as $word) {
        $last = count($rows) - 1;
        if ($last >= 0 && abs($word['Top'] - $rows[$last]['top']) <= $rowTolerance) {
            $rows[$last]['words'][] = $word;
        } else {
            $rows[] = ['top' => $word['Top'], 'words' => [$word]];
        }
    }

    $output = [];
    foreach ($rows as $row) {
        usort($row['words'], function ($a, $b) { return $a['Left'] <=> $b['Left']; });
        $text = '';
        foreach ($row['words'] as $word) {
            // OCR oddziela interpunkcję od słowa ("jarzynowa -"); doklejamy ją z powrotem
            if ($text !== '' && preg_match('/^[-–—,.:;!?)]+$/u', $word['WordText'])) {
                $text .= $word['WordText'];
                continue;
            }
            $column = (int) round($word['Left'] / $charWidth);
            $length = mb_strlen($text, 'UTF-8');
            $text .= str_repeat(' ', max($text === '' ? 0 : 1, $column - $length)) . $word['WordText'];
        }
        $output[] = $text;
    }
    return implode("\n", $output);
}

/**
 * Główna funkcja: zwraca ['result' => tablica dla script.js albo null,
 * 'legacyText' => tekst dla starego parsera w script.js albo null,
 * 'error' => komunikat dla użytkownika, 'log' => kolejne próby].
 */
function ms_convert_menu($path, array $keys) {
    $type = mp_detect_type($path);
    $log = [];
    $notes = [];
    $result = null;
    $legacyText = null;
    $error = '';
    $cloudmersive = $keys['cloudmersive'] ?? null;
    $ocrKey = $keys['ocr_space'] ?? null;

    $tryDocx = function ($docxPath, $source) use (&$log) {
        $parsed = mp_parse_docx($docxPath, $source);
        $log[] = $source . ': ' . ($parsed ? count($parsed['Days']) . ' dni' : 'brak wyniku');
        return $parsed;
    };
    $tryText = function ($text, $source) use (&$log, &$legacyText) {
        if ($text === null || trim($text) === '') {
            $log[] = $source . ': pusty tekst';
            return null;
        }
        $legacyText = $legacyText ?? $text;
        $parsed = mp_parse_text($text, $source);
        $log[] = $source . ': ' . ($parsed ? count($parsed['Days']) . ' dni' : 'brak wyniku');
        return $parsed;
    };
    $cloud = function ($kind, $endpoint, array $headers = []) use ($path, $type, $cloudmersive, &$log) {
        if (!$cloudmersive) {
            $log[] = $endpoint . ': brak klucza Cloudmersive';
            return null;
        }
        $callError = '';
        $out = $kind === 'file'
            ? ms_cloudmersive_file($endpoint, $path, 'menu.' . $type, $cloudmersive, $callError)
            : ms_cloudmersive_text($endpoint, $path, 'menu.' . $type, $cloudmersive, $callError, $headers);
        if ($out === null) $log[] = $endpoint . ': błąd (' . $callError . ')';
        return $out;
    };
    $ocr = function ($ocrType) use ($path, $ocrKey, &$log, &$notes) {
        if (!$ocrKey) {
            $log[] = 'OCR: brak klucza OCR.space';
            return null;
        }
        $callError = '';
        $note = null;
        $text = ms_ocr_space($path, $ocrType, $ocrKey, $callError, $note);
        if ($text === null) $log[] = 'OCR: błąd (' . $callError . ')';
        if ($note !== null) $notes[] = $note;
        return $text;
    };

    if ($type === 'docx') {
        $result = $tryDocx($path, 'docx');
        if (!$result) $result = $tryText($cloud('text', '/convert/docx/to/txt'), 'docx->txt');
    } elseif ($type === 'doc') {
        $docx = $cloud('file', '/convert/doc/to/docx');
        if ($docx) {
            $result = $tryDocx($docx, 'doc->docx');
            @unlink($docx);
        }
        if (!$result) $result = $tryText($cloud('text', '/convert/doc/to/txt'), 'doc->txt');
    } elseif ($type === 'pdf') {
        // Tekst z zachowanymi odstępami odtwarza kolumny tabeli lepiej niż PDF -> DOCX
        $result = $tryText($cloud('text', '/convert/pdf/to/txt', ['textFormattingMode: preserveWhitespace']), 'pdf->txt');
        if (!$result) {
            $docx = $cloud('file', '/convert/pdf/to/docx');
            if ($docx) {
                $result = $tryDocx($docx, 'pdf->docx');
                @unlink($docx);
            }
        }
        if (!$result) $result = $tryText($ocr('pdf'), 'pdf->ocr');
    } elseif ($type === 'jpg' || $type === 'png') {
        $result = $tryText($ocr($type), 'zdjecie->ocr');
    } elseif ($type === 'txt') {
        $result = $tryText(file_get_contents($path), 'tekst');
    }

    // Stary parser w script.js dostaje tylko tekst z Worda (jak dawniej).
    // Tekst ze zwykłego pliku, PDF czy OCR bez rozpoznanego jadłospisu to błąd,
    // który nie może trafić do historii widocznej dla wszystkich.
    if (!in_array($type, ['docx', 'doc'], true)) $legacyText = null;

    if ($result && $notes) {
        $result['Warnings'] = array_merge($notes, $result['Warnings'] ?? []);
    }
    if (!$result) {
        if ($type === 'jpg' || $type === 'png' || ($type === 'pdf' && !$legacyText)) {
            $error = $ocrKey
                ? 'Nie udało się odczytać jadłospisu ze zdjęcia lub skanu. Spróbuj wyraźniejszego zdjęcia (darmowy OCR przyjmuje plik do 1 MB i PDF do 3 stron).'
                : 'Zdjęcia i skany wymagają darmowego klucza OCR.space (plik ocr_config.php na serwerze).';
        } elseif (!in_array($type, ['docx', 'doc', 'pdf', 'txt'], true)) {
            $error = 'Nieobsługiwany format pliku. Wgraj jadłospis jako Word (DOC, DOCX), PDF albo zdjęcie (JPG, PNG).';
        } else {
            $error = 'Nie udało się rozpoznać dni i dań w tym pliku.';
        }
    }
    return ['type' => $type, 'result' => $result, 'legacyText' => $legacyText, 'error' => $error, 'log' => $log];
}
