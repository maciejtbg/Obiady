<?php
header('Content-Type: application/json; charset=utf-8');

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['dish']) || !isset($data['definition'])) {
    echo json_encode(['success' => false, 'error' => 'Brak danych']);
    exit;
}

$dish = trim($data['dish']);
$definition = trim($data['definition']);
$dishLower = mb_strtolower($dish, 'UTF-8');

// Ścieżka do pliku definitions.js
$file = 'definitions.js';

if (!file_exists($file)) {
    echo json_encode(['success' => false, 'error' => 'Plik definitions.js nie istnieje']);
    exit;
}

// Wczytaj zawartość pliku
$content = file_get_contents($file);

// Znajdź sekcję polishDefinitions
$pattern = '/(const polishDefinitions = \{[^}]*?)(\};)/s';

if (!preg_match($pattern, $content, $matches)) {
    echo json_encode(['success' => false, 'error' => 'Nie znaleziono sekcji polishDefinitions']);
    exit;
}

$beforeClosing = $matches[1];
$closing = $matches[2];

// Sprawdź czy definicja już istnieje
if (strpos($content, '"' . $dishLower . '"') !== false) {
    echo json_encode(['success' => true, 'message' => 'Definicja już istnieje']);
    exit;
}

// Dodaj nową definicję (przed zamykającym };)
$newEntry = ",\n        \"$dishLower\": \"$definition\"";

// Złóż nową zawartość
$newContent = str_replace(
    $matches[0],
    $beforeClosing . $newEntry . "\n    " . $closing,
    $content
);

// Zapisz do pliku
if (file_put_contents($file, $newContent)) {
    echo json_encode([
        'success' => true,
        'dish' => $dishLower,
        'definition' => $definition
    ]);
} else {
    echo json_encode(['success' => false, 'error' => 'Błąd zapisu do pliku']);
}
?>