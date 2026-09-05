<?php
// check_file.php - Sprawdzanie czy plik już istnieje w bazie

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

if (!file_exists('db_config.php')) {
    echo json_encode(['exists' => false]);
    exit;
}

require_once 'db_config.php';

if (!isset($_GET['filename'])) {
    echo json_encode(['exists' => false]);
    exit;
}

$filename = $_GET['filename'];

try {
    if (!$conn) {
        echo json_encode(['exists' => false]);
        exit;
    }
    
    $stmt = $conn->prepare("SELECT id, filename, upload_date FROM menu_history WHERE filename = ? ORDER BY upload_date DESC LIMIT 1");
    $stmt->bind_param("s", $filename);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($row = $result->fetch_assoc()) {
        echo json_encode([
            'exists' => true,
            'file' => [
                'id' => $row['id'],
                'filename' => $row['filename'],
                'upload_date' => $row['upload_date']
            ]
        ]);
    } else {
        echo json_encode(['exists' => false]);
    }
    
    $stmt->close();
    $conn->close();
    
} catch (Exception $e) {
    echo json_encode(['exists' => false, 'error' => $e->getMessage()]);
}
?>