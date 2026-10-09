<?php
// Skopiuj ten plik jako ai_config.php i wpisz klucz API, żeby opisy dań w dymkach
// pisało AI. Bez klucza opisy pochodzą ze słownika (dish_seed.php) i z Wikipedii.
//
// Domyślnie darmowy plan Groq (bez karty płatniczej): konto na https://console.groq.com,
// potem API Keys -> Create API Key. Każdy opis zapisuje się w bazie, więc o to samo
// danie pytamy tylko raz; jedno zapytanie opisuje do 12 dań naraz.
//
// Działa też każde inne API zgodne z OpenAI (zmień 'url' i 'models'), np.:
//   Cloudflare Workers AI: https://api.cloudflare.com/client/v4/accounts/ID_KONTA/ai/v1/chat/completions
//   OpenRouter:            https://openrouter.ai/api/v1/chat/completions
return [
    'api_key' => 'TWOJ_KLUCZ_GROQ',
    'url' => 'https://api.groq.com/openai/v1/chat/completions',
    // Kolejne modele są próbowane, gdy poprzedni zostanie wycofany z darmowego planu
    'models' => ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
    // Najwięcej zapytań do AI dziennie (darmowy plan Groq pozwala na ok. 1000)
    'daily_limit' => 300,
];
