# Obiady — generator deklaracji obiadowej (parser jadłospisu)

Narzędzie webowe do wczytywania jadłospisu szkolnej stołówki (Word, PDF albo zdjęcie) i generowania na jego podstawie tabeli do deklaracji obiadowej.

## Jak to działa

1. Typ pliku jest rozpoznawany po zawartości, nie po rozszerzeniu nazwy (DOCX, DOC, PDF, JPG/PNG, tekst).
2. `.docx` jest czytany **lokalnie** (`ZipArchive` + `DOMDocument`), razem ze scalonymi komórkami tabel, polami tekstowymi i listami (`menu_parser.php`).
3. Pozostałe formaty są najpierw zamieniane przez usługi zewnętrzne (`menu_services.php`), a potem trafiają do tego samego parsera:
   - `.doc` → DOCX (Cloudmersive),
   - PDF z tekstem → tekst z zachowanym układem kolumn (Cloudmersive),
   - skany PDF i zdjęcia → OCR.space (darmowy klucz; współrzędne słów odtwarzają kolumny tabeli).
4. Parser rozpoznaje znaczenie, a nie pozycję:
   - kolumny po nagłówkach z synonimami („II danie”, „danie główne”, „Alergny” z literówką),
   - tabele z dniami w wierszach albo w kolumnach, punkty i zwykłe akapity,
   - nazwy dni i miesięcy z literówkami i bez polskich znaków, daty w wielu formatach (07.09, 7/9, 7.IX, 7 września); bez dat są wyliczane z nazw dni tygodnia,
   - dni wolne („DZIEŃ WOLNY”, „święto”).
5. Wynik jest sprawdzany: niezgodność nazwy dnia z datą, powtórzone dni, brakujące dni robocze, dni bez dań. Uwagi pokazują się użytkownikowi pod polem wyboru pliku.
6. Wynik dla tego samego pliku jest zapamiętywany w `cache/` (oszczędza limity darmowych usług) i zapisywany w historii w bazie danych (jeśli skonfigurowana jest baza — `db_config.php`).
7. Do nazw dań dopasowywane są opisy z lokalnego słownika (`definitions.js`), także przy literówkach — podpowiedzi po najechaniu kursorem.
8. Użytkownik wybiera interesujące go obiady i generuje gotową tabelę do deklaracji.

## Funkcje

- Wczytywanie jadłospisu z Worda (DOC, DOCX), PDF, skanu albo zdjęcia
- Odporność na zmiany układu, nazewnictwa i literówki w jadłospisie
- Historia wczytanych jadłospisów (zapis do MySQL)
- Wybór konkretnych obiadów i generowanie tabeli do deklaracji
- Kalendarz na lodówkę (TXT, DOCX, PDF): cały miesiąc z informacją, w które dni jest zamówiona zupa i/lub drugie danie, z nazwami dań albo bez
- Tryb ciemny/jasny, statystyki odwiedzin

## Stack

PHP (ZipArchive, DOMDocument, cURL, MySQLi), Bootstrap, vanilla JS.

## Konfiguracja

- Baza danych: skopiuj `db_config.example.php` do `db_config.php` i uzupełnij prawdziwymi danymi (plik nie jest w repo — patrz `.gitignore`).
- Klucz API Cloudmersive (pliki DOC i PDF): ustaw zmienną środowiskową `CLOUDMERSIVE_API_KEY` albo skopiuj `cloudmersive_config.example.php` do `cloudmersive_config.php` i wpisz tam swój klucz.
- Klucz OCR.space (skany i zdjęcia, darmowy, rejestracja e-mailem na ocr.space/ocrapi): ustaw `OCR_SPACE_API_KEY` albo skopiuj `ocr_config.example.php` do `ocr_config.php`.

## Testy parsera

- `php tests/run_tests.php` porównuje wynik parsera dla plików z `tests/files` ze wzorcami w `tests/expected` (`--update` zapisuje nowe wzorce po świadomej zmianie parsera).
- `tests/generator/` tworzy losowe jadłospisy w 8 układach (tabela, dni w kolumnach, punkty, myślniki, numeracja, akapity, jedna linia na dzień, bez dat) z błędami w nazwach dni i datach (np. „Po nie działek”, „Wtroek”, „1O.02”, „15,01”, „11-go stycznia”) i sprawdza, czy parser je odczytuje:
  - `python tests/generator/generuj_jadlospisy.py 200` (wymaga `pip install python-docx`),
  - `python tests/generator/sprawdz_parser.py docx,txt` (PHP z PATH albo ze zmiennej `PHP`); z `--services` albo `--ocr` sprawdza też pliki PDF, DOC i zdjęcia przez Cloudmersive i OCR.space.
