<?php
if (isset($_FILES['file']) && $_FILES['file']['error'] == UPLOAD_ERR_OK) {
    // Wprowadź swój klucz API uzyskany z Cloudmersive
    $apiKey = 'ffdd008a-b3b4-4847-906c-e4fcfc1f63e7';

    $filePath = $_FILES['file']['tmp_name'];

    // Przygotowanie zapytania cURL do API Cloudmersive
    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => "https://api.cloudmersive.com/convert/doc/to/txt",
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['inputFile' => new CURLFile($filePath)],
        CURLOPT_HTTPHEADER => ["Apikey: $apiKey"]
    ]);

    $response = curl_exec($curl);
    $error = curl_error($curl);
    curl_close($curl);

    if ($error) {
        echo "Błąd cURL: " . htmlspecialchars($error);
    } elseif ($response) {
        // Wyświetlenie przekonwertowanego tekstu
        echo "<h2>Wynik konwersji:</h2>";
        echo "<pre>" . htmlspecialchars($response) . "</pre>";
    } else {
        echo "Błąd konwersji pliku.";
    }
} else {
    echo "Nie przesłano pliku lub wystąpił błąd przesyłania.";
}
?>