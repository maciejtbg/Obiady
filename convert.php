<?php
// convert.php
header('Content-Type: application/json');

if (isset($_FILES['file']) && $_FILES['file']['error'] === UPLOAD_ERR_OK) {
    $tmpFile = $_FILES['file']['tmp_name'];
    $filename = $_FILES['file']['name'];

    // Ustaw swój klucz API z Cloudmersive (zarejestruj się i uzyskaj darmowy klucz)
    $apiKey = 'ffdd008a-b3b4-4847-906c-e4fcfc1f63e7'; // <- Wstaw tutaj swój klucz API

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
?>