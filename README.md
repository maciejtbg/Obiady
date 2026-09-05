# Obiady — generator deklaracji obiadowej (parser jadłospisu)

Narzędzie webowe do wczytywania jadłospisu szkolnej stołówki (plik `.doc`/`.docx`) i generowania na jego podstawie tabeli do deklaracji obiadowej.

## Jak to działa

1. Dla plików `.docx` z tabelami tygodniowego jadłospisu — dokument jest parsowany **lokalnie**, bez żadnego zewnętrznego API (`ZipArchive` + `DOMDocument` czytają bezpośrednio XML pliku Word), co daje ustrukturyzowany wynik (dni, dania, ceny) niezależny od tego, jak zewnętrzne API „spłaszczyłoby" tabelę do tekstu.
2. Jeśli lokalny parser się nie powiedzie (stary format pliku, plik `.doc`, brak wymaganych rozszerzeń PHP na serwerze) — używany jest, jako metoda rezerwowa, zewnętrzny konwerter Cloudmersive (DOC/DOCX → tekst).
3. Wynik każdej konwersji jest zapisywany w historii w bazie danych (jeśli skonfigurowana jest baza — `db_config.php`).
4. Do nazw dań dopasowywane są opisy z lokalnego słownika (`definitions.js`) — podpowiedzi po najechaniu kursorem.
5. Użytkownik wybiera interesujące go obiady i generuje gotową tabelę do deklaracji.

## Funkcje

- Lokalne parsowanie tabel jadłospisu z `.docx` (bez zależności od zewnętrznego API w większości przypadków)
- Rezerwowa konwersja przez Cloudmersive dla starszych/nietypowych plików
- Historia wczytanych jadłospisów (zapis do MySQL)
- Wybór konkretnych obiadów i generowanie tabeli do deklaracji
- Tryb ciemny/jasny, statystyki odwiedzin

## Stack

PHP (ZipArchive, DOMDocument, MySQLi), Bootstrap, vanilla JS.

## Konfiguracja

- Baza danych: skopiuj `db_config.example.php` do `db_config.php` i uzupełnij prawdziwymi danymi (plik nie jest w repo — patrz `.gitignore`).
- Klucz API Cloudmersive (używany tylko jako fallback): ustaw zmienną środowiskową `CLOUDMERSIVE_API_KEY` albo skopiuj `cloudmersive_config.example.php` do `cloudmersive_config.php` i wpisz tam swój klucz.
