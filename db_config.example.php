<?php
// Skopiuj ten plik jako db_config.php i uzupelnij prawdziwymi danymi.
$db_host = 'TWOJ_HOST_MYSQL';
$db_username = 'TWOJ_USER';
$db_password = 'TWOJE_HASLO';
$db_name = 'TWOJA_BAZA';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn = null;
try {
    $conn = new mysqli($db_host, $db_username, $db_password, $db_name);
    if ($conn->connect_error) {
        throw new Exception('Connect Error: ' . $conn->connect_error);
    }
    $conn->set_charset("utf8mb4");
} catch (Exception $e) {
    error_log('DB Connection Error: ' . $e->getMessage());
    $conn = null;
}
