<?php
// convert.php
header('Content-Type: application/json');

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $tmpFile = $_FILES['file']['tmp_name'];
    $filename = $_FILES['file']['name'];

    // Klucz API Cloudmersive wczytywany ze zmiennej środowiskowej lub pliku config.php
    // (zarejestruj się na cloudmersive.com i ustaw własny klucz w konfiguracji serwera)
    $apiKey = getenv('CLOUDMERSIVE_API_KEY');
    if (!$apiKey && file_exists(__DIR__ . '/config.php')) {
        $config = include __DIR__ . '/config.php';
        $apiKey = $config['cloudmersive_api_key'] ?? null;
    }
    if (!$apiKey) {
        echo json_encode(array(
            "Successful" => false,
            "Error" => "Brak skonfigurowanego klucza API Cloudmersive. Ustaw zmienną środowiskową CLOUDMERSIVE_API_KEY lub plik config.php."
        ));
        exit;
    }

    // Wykrycie rozszerzenia pliku
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext === 'doc') {
        $url = "https://api.cloudmersive.com/convert/doc/to/txt";
    } elseif ($ext === 'docx') {
        $url = "https://api.cloudmersive.com/convert/docx/to/txt";
    } else {
        echo json_encode(array(
            "Successful" => false,
            "Error" => "Nieobsługiwany format pliku. Przesyłaj tylko pliki DOC lub DOCX."
        ));
        exit;
    }

    // Przygotowanie zapytania cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);

    // Przygotowanie pliku do wysłania
    $cFile = curl_file_create($tmpFile, $_FILES['file']['type'], $filename);
    $postData = array('inputFile' => $cFile);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);

    // Dodanie nagłówka z kluczem API
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        "Apikey: $apiKey"
    ));

    // Wykonanie zapytania
    $response = curl_exec($ch);
    $curlError = curl_error($ch);
    curl_close($ch);

    // Obsługa błędów cURL
    if ($curlError) {
        echo json_encode(array(
            "Successful" => false,
            "Error" => "Błąd cURL: " . $curlError
        ));
        exit;
    }

    // Zakładamy, że API zwróciło przekonwertowany tekst (plain text)
    $textResult = $response;

    echo json_encode(array(
        "Successful" => true,
        "TextResult" => $textResult
    ));
} else {
    echo json_encode(array(
        "Successful" => false,
        "Error" => "Plik nie został przesłany lub wystąpił błąd podczas przesyłania."
    ));
}
