<?php
// get_history.php - Pobieranie historii z lazy loading

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if (!file_exists('db_config.php')) {
    echo json_encode([
        'success' => false,
        'error' => 'Brak pliku db_config.php',
        'history' => []
    ]);
    exit;
}

require_once 'db_config.php';

try {
    // ✅ Pobierz parametr limit z GET (domyślnie 1 = tylko najnowszy)
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1;
    
    // Zabezpieczenie - max 50 rekordów
    if ($limit < 1) $limit = 1;
    if ($limit > 50) $limit = 50;
    
    // ✅ Sortowanie po ID DESC (najwyższe ID = najnowsze)
    $query = "SELECT 
                id, 
                filename, 
                converted_text, 
                DATE_FORMAT(upload_date, '%d.%m.%Y %H:%i') as upload_date 
              FROM menu_history 
              ORDER BY id DESC 
              LIMIT ?";
    
    $stmt = $conn->prepare($query);
    $stmt->bind_param("i", $limit);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result === false) {
        throw new Exception('Błąd zapytania: ' . $conn->error);
    }
    
    $history = [];
    while ($row = $result->fetch_assoc()) {
        $history[] = [
            'id' => (int)$row['id'],
            'filename' => $row['filename'],
            'converted_text' => $row['converted_text'],
            'upload_date' => $row['upload_date']
        ];
    }
    
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'history' => $history,
        'count' => count($history),
        'limit' => $limit
    ], JSON_UNESCAPED_UNICODE);
    
} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
        'history' => []
    ]);
}

$conn->close();
?>