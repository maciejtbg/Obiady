# Obiady — parser jadłospisu z pliku DOC

Narzędzie webowe zamieniające jadłospis szkolnej/zakładowej stołówki (plik `.doc`/`.docx`) na czytelną, interaktywną tabelę HTML.

## Jak to działa

1. Użytkownik wgrywa plik DOC/DOCX z jadłospisem.
2. Plik trafia do API Cloudmersive, które konwertuje go na czysty tekst (`convert.php`).
3. Skrypt po stronie przeglądarki rozpoznaje dni, daty i nazwy dań, generując tabelę menu.
4. Do nazw dań dopasowywane są opisy z lokalnego słownika (`definitions.js`) — po najechaniu kursorem (Tippy.js) pokazuje się krótki opis potrawy.

## Funkcje

- Podgląd menu w formie tabeli (dzień, data, danie)
- Podpowiedzi z opisem potraw po najechaniu myszką
- Tryb ciemny/jasny
- Tryb debugowania do podglądu surowego tekstu z konwersji

## Stack

PHP (backend konwersji), Bootstrap 5, Tippy.js, vanilla JS.

## Konfiguracja

Wymaga własnego klucza API Cloudmersive — ustaw zmienną środowiskową `CLOUDMERSIVE_API_KEY` lub skopiuj `config.example.php` do `config.php` i wpisz tam klucz.
