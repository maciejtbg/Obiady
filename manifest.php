<?php
// manifest.php - opis aplikacji dla telefonu (ikona na ekranie, nazwa, kolory).
// Jako PHP, bo ochrona hostingu przed botami zamiast pliku .webmanifest odsyła
// stronę ze sprawdzaniem przeglądarki; zapytania do PHP z ciasteczkiem przechodzą
// (w index.html link ma crossorigin="use-credentials", żeby ciasteczko było wysłane).
header('Content-Type: application/manifest+json; charset=utf-8');
header('Cache-Control: no-cache');

echo json_encode([
    'name' => 'Deklaracja obiadowa (Katolik)',
    'short_name' => 'Obiady',
    'description' => 'Jadłospis, wybór obiadów i deklaracja dla rodziców z Katolika',
    'lang' => 'pl',
    'dir' => 'ltr',
    'start_url' => './',
    'scope' => './',
    'display' => 'standalone',
    'background_color' => '#f3f6f2',
    'theme_color' => '#1f9d63',
    'icons' => [
        ['src' => 'icons/icon-192.png', 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => 'icons/icon-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any'],
        ['src' => 'icons/icon-maskable-512.png', 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'maskable'],
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
