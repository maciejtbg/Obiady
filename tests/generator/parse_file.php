<?php
// Wynik parsera dla jednego pliku jako JSON (używany przez sprawdz_parser.py).
// Trzeci argument: "services" (Cloudmersive i OCR z konfiguracji) albo "ocr" (tylko OCR).
require __DIR__ . '/../../menu_services.php';
$path = $argv[1];
$mode = $argv[2] ?? 'local';
if ($mode === 'local') {
    $type = mp_detect_type($path);
    $result = $type === 'docx' ? mp_parse_docx($path) : ($type === 'txt' ? mp_parse_text(file_get_contents($path)) : null);
    echo json_encode(['type' => $type, 'result' => $result], JSON_UNESCAPED_UNICODE);
    exit;
}
$keys = ms_load_keys();
if ($mode === 'ocr') $keys['cloudmersive'] = null;
$out = ms_convert_menu($path, $keys);
echo json_encode(['type' => $out['type'], 'result' => $out['result'], 'error' => $out['error'], 'log' => $out['log']], JSON_UNESCAPED_UNICODE);
