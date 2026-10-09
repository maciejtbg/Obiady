<?php
// dish_info.php - opisy dań do dymków w tabeli jadłospisu (patrz dish_descriptions.php)
//
// Wejście (POST, JSON): {"dishes": [{"name": "Zupa pomidorowa z makaronem – 250 ml", "kind": "zupa"}, ...]}
// Wyjście: {"Successful": true, "Descriptions": {"<nazwa>": {"text": "...", "source": "ai"}}, "Stats": {...}}

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/dish_descriptions.php';

const DISH_INFO_MAX_DISHES = 40;
const DISH_INFO_MAX_NAME = 300;

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input) || !isset($input['dishes']) || !is_array($input['dishes'])) {
    echo json_encode(['Successful' => false, 'Error' => 'Brak listy dań.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$requests = [];
foreach (array_slice($input['dishes'], 0, DISH_INFO_MAX_DISHES) as $dish) {
    $name = is_array($dish) ? ($dish['name'] ?? '') : $dish;
    if (!is_string($name)) continue;
    $name = trim($name);
    if ($name === '' || mb_strlen($name, 'UTF-8') > DISH_INFO_MAX_NAME) continue;
    $kind = is_array($dish) && ($dish['kind'] ?? '') === 'zupa' ? 'zupa' : 'drugie';
    $requests[] = ['name' => $name, 'kind' => $kind];
}

$conn = null;
if (file_exists(__DIR__ . '/db_config.php')) {
    require_once __DIR__ . '/db_config.php';
}

try {
    $descriptions = dd_describe($conn, $requests, $stats, $log);
    echo json_encode(['Successful' => true, 'Descriptions' => (object)$descriptions, 'Stats' => $stats, 'Log' => $log], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('dish_info: ' . $e->getMessage());
    echo json_encode(['Successful' => false, 'Error' => 'Nie udało się pobrać opisów dań.'], JSON_UNESCAPED_UNICODE);
}

if ($conn) $conn->close();
