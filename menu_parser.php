<?php
// menu_parser.php - rozpoznawanie jadłospisu niezależnie od formatu i układu pliku.
//
// Wynik ma zawsze postać, której oczekuje script.js (parseMenuFromTableData):
//   ['Successful' => true, 'Format' => 'table', 'Source' => 'docx', 'Month' => 9, 'Year' => 2026,
//    'Days' => [['date' => '07.09', 'dayName' => 'PONIEDZIAŁEK', 'zupa' => ..., 'drugieDanie' => ...,
//                'deser' => ..., 'alergeny' => ...], ...],
//    'Prices' => ['zupa' => 8.5, ...], 'Warnings' => ['...']]
//
// Kroki: plik -> tabele i linie tekstu -> dni z datami -> sprawdzenie wyniku.
// Zamiast stałych pozycji kolumn i dokładnych napisów rozpoznajemy znaczenie:
// nagłówki z synonimami, nazwy dni i miesięcy z tolerancją na literówki,
// daty w wielu formatach, a gdy dat brak, wyliczamy je z nazw dni tygodnia.

const MP_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const MP_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

const MP_WEEKDAY_NAMES = [1 => 'PONIEDZIAŁEK', 2 => 'WTOREK', 3 => 'ŚRODA', 4 => 'CZWARTEK', 5 => 'PIĄTEK', 6 => 'SOBOTA', 7 => 'NIEDZIELA'];
const MP_WEEKDAY_LOWER = [1 => 'poniedziałek', 2 => 'wtorek', 3 => 'środa', 4 => 'czwartek', 5 => 'piątek', 6 => 'sobota', 7 => 'niedziela'];

// Pierwsza forma to pełna nazwa (do porównań z literówkami), dalej skróty
const MP_WEEKDAYS = [
    1 => ['poniedzialek', 'pon', 'pn', 'poniedz', 'pond'],
    2 => ['wtorek', 'wt', 'wto', 'wtr'],
    3 => ['sroda', 'sr', 'sro', 'srd'],
    4 => ['czwartek', 'czw', 'cz', 'czwart'],
    5 => ['piatek', 'pt', 'pia', 'piat', 'ptk'],
    6 => ['sobota', 'sob', 'sb'],
    7 => ['niedziela', 'nd', 'ndz', 'niedz'],
];

const MP_MONTHS = [
    1 => ['styczen', 'stycznia', 'sty'], 2 => ['luty', 'lutego', 'lut'], 3 => ['marzec', 'marca', 'mar'],
    4 => ['kwiecien', 'kwietnia', 'kwi'], 5 => ['maj', 'maja'], 6 => ['czerwiec', 'czerwca', 'cze'],
    7 => ['lipiec', 'lipca', 'lip'], 8 => ['sierpien', 'sierpnia', 'sie'], 9 => ['wrzesien', 'wrzesnia', 'wrz'],
    10 => ['pazdziernik', 'pazdziernika', 'paz'], 11 => ['listopad', 'listopada', 'lis'], 12 => ['grudzien', 'grudnia', 'gru'],
];

const MP_ROMAN = ['i' => 1, 'ii' => 2, 'iii' => 3, 'iv' => 4, 'v' => 5, 'vi' => 6, 'vii' => 7, 'viii' => 8, 'ix' => 9, 'x' => 10, 'xi' => 11, 'xii' => 12];

// Rola kolumny / etykiety rozpoznawana po słowach (kolejność ma znaczenie:
// "II danie" musi trafić do drugiego dania, zanim sprawdzimy "I danie")
const MP_ROLE_PHRASES = [
    'allergens' => [['alergeny'], ['alergen'], ['alergenne'], ['alergenow']],
    'dessert' => [['deser'], ['desery'], ['podwieczorek']],
    'main' => [['drugie'], ['ii', 'danie'], ['2', 'danie'], ['danie', 'glowne'], ['dania', 'glowne'], ['danie', 'drugie'], ['obiad']],
    'soup' => [['zupa'], ['zupy'], ['i', 'danie'], ['1', 'danie'], ['pierwsze', 'danie'], ['danie', 'pierwsze'], ['pierwsze']],
    'day' => [['dzien'], ['data'], ['dni'], ['termin']],
    'ignore' => [['gramatura'], ['kcal'], ['kalorie'], ['wartosc'], ['sniadanie'], ['kolacja'], ['cena'], ['uwagi'], ['napoj'], ['kompot'], ['lp'], ['nr'], ['waga']],
];

const MP_SOUP_WORDS = ['zupa', 'zupka', 'rosol', 'barszcz', 'krupnik', 'zurek', 'kapusniak', 'chlodnik', 'krem', 'grochowka',
    'kartoflanka', 'flaki', 'bulion', 'ogorkowa', 'pomidorowa', 'jarzynowa', 'szczawiowa', 'pieczarkowa', 'fasolowa',
    'kalafiorowa', 'brokulowa', 'marchewkowa', 'dyniowa', 'soczewicowa', 'koperkowa', 'grzybowa', 'cebulowa', 'gulaszowa',
    'minestrone', 'buraczkowa', 'wielowarzywna', 'warzywna', 'serowa', 'porowa', 'cukiniowa', 'neapolitanska', 'jagodowa',
    'owocowa', 'grochowa', 'ziemniaczana', 'porowo'];

const MP_DESSERT_WORDS = ['deser', 'owoc', 'owoce', 'jablko', 'banan', 'gruszka', 'mandarynka', 'pomarancza', 'kiwi', 'jogurt',
    'budyn', 'kisiel', 'galaretka', 'ciasto', 'ciastko', 'ciasteczko', 'muffin', 'mus', 'babka', 'drozdzowka', 'batonik', 'wafel'];

const MP_NO_MEAL_PHRASES = ['dzien wolny', 'wolne', 'wolny', 'swieto', 'brak obiad', 'bez obiad', 'nie ma obiad', 'nieczynn',
    'ferie', 'dyrektorsk', 'wycieczk', 'odwolan', 'zamkniet', 'przerwa swiateczna', 'nie wydajemy'];

// ---------------------------------------------------------------
// Pomocnicze: porównywanie tekstu bez wielkości liter i polskich znaków
// ---------------------------------------------------------------

function mp_fold($text) {
    $text = mb_strtolower((string) $text, 'UTF-8');
    $text = strtr($text, ['ą' => 'a', 'ć' => 'c', 'ę' => 'e', 'ł' => 'l', 'ń' => 'n', 'ó' => 'o', 'ś' => 's', 'ź' => 'z', 'ż' => 'z']);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $text));
}

function mp_tokens($text) {
    $folded = mp_fold($text);
    return $folded === '' ? [] : explode(' ', $folded);
}

function mp_word_count($text) {
    return count(mp_tokens($text));
}

// Czy ciąg słów $tokens zawiera frazę $phrase (słowa obok siebie)
function mp_tokens_contain(array $tokens, array $phrase) {
    $n = count($phrase);
    for ($i = 0; $i + $n <= count($tokens); $i++) {
        if (array_slice($tokens, $i, $n) === $phrase) return true;
    }
    return false;
}

function mp_ucfirst($text) {
    return mb_strtoupper(mb_substr($text, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($text, 1, null, 'UTF-8');
}

// Nazwa dnia tygodnia (1 = poniedziałek ... 7 = niedziela) z tolerancją na literówki
function mp_weekday($word) {
    $word = str_replace(' ', '', mp_fold($word));
    if ($word === '') return null;
    foreach (MP_WEEKDAYS as $n => $forms) {
        if (in_array($word, $forms, true)) return $n;
    }
    if (strlen($word) < 4) return null;
    $best = null;
    $bestDistance = 99;
    foreach (MP_WEEKDAYS as $n => $forms) {
        if (strpos($forms[0], $word) === 0) return $n; // skrót typu "czwar", "piat"
        $distance = levenshtein($word, $forms[0]);
        if ($distance < $bestDistance) {
            $bestDistance = $distance;
            $best = $n;
        }
    }
    return $bestDistance <= (strlen($word) >= 6 ? 2 : 1) ? $best : null;
}

// Miesiąc (1-12) z nazwy w mianowniku lub dopełniaczu, z tolerancją na literówki
function mp_month($word) {
    $word = mp_fold($word);
    if ($word === '') return null;
    foreach (MP_MONTHS as $n => $forms) {
        if (in_array($word, $forms, true)) return $n;
    }
    if (strlen($word) < 5) return null;
    foreach (MP_MONTHS as $n => $forms) {
        foreach (array_slice($forms, 0, 2) as $form) {
            if (levenshtein($word, $form) <= 2) return $n;
        }
    }
    return null;
}

// Rola kolumny albo etykiety (zupa, drugie danie, deser, alergeny, dzień)
function mp_role($label) {
    $tokens = mp_tokens($label);
    if (!$tokens) return null;
    foreach (MP_ROLE_PHRASES as $role => $phrases) {
        foreach ($phrases as $phrase) {
            if (mp_tokens_contain($tokens, $phrase)) return $role;
        }
    }
    // Literówki w nagłówkach ("alergny", "drugei")
    foreach (MP_ROLE_PHRASES as $role => $phrases) {
        foreach ($phrases as $phrase) {
            if (count($phrase) !== 1 || strlen($phrase[0]) < 5) continue;
            foreach ($tokens as $token) {
                if (strlen($token) >= 4 && levenshtein($token, $phrase[0]) <= 1) return $role;
            }
        }
    }
    return null;
}

function mp_is_no_meal($text) {
    $folded = ' ' . mp_fold($text) . ' ';
    foreach (MP_NO_MEAL_PHRASES as $phrase) {
        if (strpos($folded, ' ' . $phrase) !== false) return true;
    }
    return false;
}

function mp_looks_like_soup($text) {
    foreach (array_slice(mp_tokens($text), 0, 3) as $token) {
        if (in_array($token, MP_SOUP_WORDS, true)) return true;
    }
    return false;
}

function mp_looks_like_dessert($text) {
    $tokens = mp_tokens($text);
    if (!$tokens || count($tokens) > 4) return false;
    foreach ($tokens as $token) {
        if (in_array($token, MP_DESSERT_WORDS, true)) return true;
    }
    return false;
}

// "1,7,9", "(1, 3, 7)", "Alergeny: 1,7"
function mp_is_allergen_list($text) {
    return (bool) preg_match('/^\(?\s*\d{1,2}(\s*[,;.]\s*\d{1,2})+\s*\)?$/', trim($text));
}

function mp_clean_allergens($text) {
    preg_match_all('/\d{1,2}/', $text, $m);
    return implode(',', $m[0]);
}

// ---------------------------------------------------------------
// Rozpoznanie dnia: nazwa dnia tygodnia i/lub data
// ---------------------------------------------------------------

/**
 * Szuka nazwy dnia tygodnia i/lub daty. W linii tekstu kotwica musi być na
 * początku; w komórce kolumny "dzień" ($inCell) może być też dalej.
 * Zwraca ['day', 'month', 'year', 'weekday', 'weekdayRaw', 'rest'] albo null.
 */
function mp_parse_anchor($text, $inCell = false) {
    // Tabulatory zostają: w tekście z OCR oddzielają kolumny
    $text = trim(preg_replace('/[ \x{00A0}\r\n]+/u', ' ', (string) $text));
    if ($text === '') return null;
    $result = ['day' => null, 'month' => null, 'year' => null, 'weekday' => null, 'weekdayRaw' => '', 'rest' => ''];
    $end = 0;

    // Nazwa dnia: pierwsze słowo (w komórce dnia także drugie lub trzecie)
    preg_match_all('/\p{L}+/u', $text, $words, PREG_OFFSET_CAPTURE);
    foreach (array_slice($words[0], 0, $inCell ? 3 : 1) as $word) {
        if (!$inCell && $word[1] > 3) break;
        $weekday = mp_weekday($word[0]);
        if ($weekday !== null) {
            $result['weekday'] = $weekday;
            $result['weekdayRaw'] = $word[0];
            $end = $word[1] + strlen($word[0]);
            break;
        }
    }

    // Data: 07.09 | 7/9 | 07-09-2026 | 7.IX | 7 września (2026)
    $from = $result['weekday'] !== null && !$inCell ? $end : 0;
    $tail = substr($text, $from);
    $patterns = [
        ['/(?<!\d)(\d{1,2})\s*[.\/-]\s*(\d{1,2})(?:\s*[.\/-]\s*((?:19|20)?\d{2}))?(?:\s*r\b\.?)?(?![\d,])/u', 'num'],
        ['/(?<!\d)(\d{1,2})\s*[.\s]\s*(XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)(?!\p{L})\.?/iu', 'roman'],
        ['/(?<!\d)(\d{1,2})\s+(\p{L}{3,})\.?(?:\s+((?:19|20)\d{2}))?/u', 'word'],
    ];
    $best = null;
    foreach ($patterns as $pattern) {
        if (!preg_match_all($pattern[0], $tail, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) continue;
        foreach ($matches as $m) {
            $offset = $m[0][1];
            if ($offset > ($inCell ? 40 : 3)) break;
            $day = (int) $m[1][0];
            if ($pattern[1] === 'num') $month = (int) $m[2][0];
            elseif ($pattern[1] === 'roman') $month = MP_ROMAN[strtolower($m[2][0])];
            else $month = mp_month($m[2][0]);
            if (!$month || $month > 12 || $day < 1 || $day > 31) continue;
            if ($best === null || $offset < $best['offset']) {
                $year = isset($m[3]) && $m[3][0] !== '' ? (int) $m[3][0] : null;
                if ($year !== null && $year < 100) $year += 2000;
                $best = ['offset' => $offset, 'length' => strlen($m[0][0]), 'day' => $day, 'month' => $month, 'year' => $year];
            }
            break;
        }
    }
    if ($best !== null) {
        $result['day'] = $best['day'];
        $result['month'] = $best['month'];
        $result['year'] = $best['year'];
        $end = max($end, $from + $best['offset'] + $best['length']);

        // Nazwa dnia za datą: "07.09 poniedziałek"
        if ($result['weekday'] === null && preg_match('/^[\s,.:\-–(]*(\p{L}+)/u', substr($text, $end), $m)) {
            $weekday = mp_weekday($m[1]);
            if ($weekday !== null) {
                $result['weekday'] = $weekday;
                $result['weekdayRaw'] = $m[1];
                $end += strlen($m[0]);
            }
        }
    }

    if ($result['weekday'] === null && $result['day'] === null) return null;
    $result['rest'] = trim(preg_replace('/^[\s:;,.\-–—|•)]+/u', '', substr($text, $end)));
    return $result;
}

// ---------------------------------------------------------------
// Odczyt pliku DOCX: tabele (z obsługą scalonych komórek) i linie tekstu
// ---------------------------------------------------------------

function mp_docx_read($path) {
    if (!class_exists('ZipArchive') || !class_exists('DOMDocument')) return null;
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return null;
    $xml = $zip->getFromName('word/document.xml');
    $zip->close();
    if ($xml === false) return null;

    $dom = new DOMDocument();
    // Zabezpieczenie przed XXE: nie rozwijamy zewnętrznych encji z przesłanego pliku
    $previous = libxml_use_internal_errors(true);
    $loaded = $dom->loadXML($xml, LIBXML_NONET);
    libxml_use_internal_errors($previous);
    if (!$loaded) return null;

    $xpath = new DOMXPath($dom);
    $xpath->registerNamespace('w', MP_W);
    $xpath->registerNamespace('mc', MP_MC);
    $body = $xpath->query('/w:document/w:body')->item(0);
    if (!$body) return null;

    $doc = ['tables' => [], 'lines' => []];
    mp_docx_walk_blocks($xpath, $body, $doc);
    $doc['text'] = implode("\n", $doc['lines']);
    return $doc;
}

// Przechodzi po akapitach i tabelach w kolejności dokumentu, także w polach
// tekstowych (kształtach) i kontrolkach zawartości
function mp_docx_walk_blocks($xpath, $parent, &$doc) {
    foreach ($parent->childNodes as $node) {
        if ($node->nodeType !== XML_ELEMENT_NODE) continue;
        if ($node->localName === 'p') {
            $text = mp_docx_paragraph_text($node, "\n");
            foreach (preg_split('/\n/u', $text) as $line) {
                if (trim($line) !== '') $doc['lines'][] = trim($line);
            }
            // Pola tekstowe; mc:Fallback to kopia tej samej treści dla starszych programów
            foreach ($xpath->query('.//w:txbxContent[not(ancestor::mc:Fallback)]', $node) as $box) {
                mp_docx_walk_blocks($xpath, $box, $doc);
            }
        } elseif ($node->localName === 'tbl') {
            $grid = mp_docx_table_grid($xpath, $node);
            $doc['tables'][] = $grid;
            foreach ($grid as $row) {
                $cells = array_filter(array_map(function ($cell) { return $cell['text']; }, $row), 'strlen');
                if ($cells) $doc['lines'][] = implode("\t", $cells);
            }
        } elseif ($node->localName === 'sdt' || $node->localName === 'sdtContent' || $node->localName === 'customXml') {
            mp_docx_walk_blocks($xpath, $node, $doc);
        }
    }
}

// Tekst akapitu; $break to separator dla złamań wiersza i tabulatorów
function mp_docx_paragraph_text($paragraph, $break) {
    $text = '';
    foreach ($paragraph->childNodes as $node) {
        mp_docx_walk_run($node, $text, $break);
    }
    return $text;
}

function mp_docx_walk_run($node, &$text, $break) {
    if ($node->nodeType !== XML_ELEMENT_NODE) return;
    $name = $node->localName;
    if ($name === 't') {
        $text .= $node->textContent;
    } elseif ($name === 'br' || $name === 'cr') {
        $text .= $break;
    } elseif ($name === 'tab') {
        $text .= $break === "\n" ? "\t" : $break;
    } elseif (in_array($name, ['r', 'hyperlink', 'ins', 'smartTag', 'fldSimple', 'sdt', 'sdtContent'], true)) {
        foreach ($node->childNodes as $child) {
            mp_docx_walk_run($child, $text, $break);
        }
    }
}

// Tekst komórki tabeli: akapity i złamania wiersza łączone " | " (jak dotychczas)
function mp_docx_cell_text($xpath, $cell) {
    $parts = [];
    foreach ($xpath->query('.//w:p[not(ancestor::mc:Fallback)]', $cell) as $paragraph) {
        $text = trim(mp_docx_paragraph_text($paragraph, ' | '));
        if ($text !== '') $parts[] = $text;
    }
    return implode(' | ', $parts);
}

/**
 * Siatka tabeli: $grid[wiersz][kolumna] = ['text' => ..., 'span' => n].
 * Komórka rozciągnięta na kilka kolumn (gridSpan) ma tekst tylko w pierwszej;
 * komórka scalona w pionie (vMerge) dostaje tekst z komórki powyżej.
 */
function mp_docx_table_grid($xpath, $table) {
    $grid = [];
    $r = 0;
    foreach ($xpath->query('./w:tr | ./w:sdt/w:sdtContent/w:tr', $table) as $row) {
        $col = 0;
        $before = $xpath->query('./w:trPr/w:gridBefore', $row);
        if ($before->length) $col += (int) $before->item(0)->getAttributeNS(MP_W, 'val');
        $cells = [];
        foreach ($xpath->query('./w:tc | ./w:sdt/w:sdtContent/w:tc', $row) as $cell) {
            $span = (int) $xpath->evaluate('string(./w:tcPr/w:gridSpan/@w:val)', $cell);
            $span = max(1, $span);
            $text = mp_docx_cell_text($xpath, $cell);
            $vMerge = $xpath->query('./w:tcPr/w:vMerge', $cell);
            if ($vMerge->length && $vMerge->item(0)->getAttributeNS(MP_W, 'val') !== 'restart' && isset($grid[$r - 1][$col])) {
                $text = $grid[$r - 1][$col]['text'];
            }
            $cells[$col] = ['text' => $text, 'span' => $span];
            for ($k = 1; $k < $span; $k++) {
                $cells[$col + $k] = ['text' => '', 'span' => 0];
            }
            $col += $span;
        }
        if ($cells) {
            $width = max(array_keys($cells)) + 1;
            for ($k = 0; $k < $width; $k++) {
                if (!isset($cells[$k])) $cells[$k] = ['text' => '', 'span' => 1];
            }
            ksort($cells);
        }
        $grid[$r++] = $cells;
    }
    return $grid;
}

// ---------------------------------------------------------------
// Tabele: cennik, układ zwykły (dni w wierszach) i odwrócony (dni w kolumnach)
// ---------------------------------------------------------------

function mp_parse_price($text) {
    if (!preg_match('/(\d{1,3})\s*[.,]\s*(\d{2})\s*(?:zł|zl|pln)?/iu', $text, $m)) return null;
    return (float) ($m[1] . '.' . $m[2]);
}

// Zwraca true, jeśli tabela to cennik (wtedy uzupełnia $prices)
function mp_parse_price_table(array $grid, array &$prices) {
    if (!$grid) return false;
    $header = mp_fold(implode(' ', array_map(function ($cell) { return $cell['text']; }, reset($grid))));
    if (strpos($header, 'cena') === false && strpos($header, 'cennik') === false) return false;
    foreach (array_slice($grid, 1) as $row) {
        $texts = array_values(array_map(function ($cell) { return $cell['text']; }, $row));
        if (count($texts) < 2) continue;
        $label = mp_fold($texts[0]);
        $price = null;
        for ($i = count($texts) - 1; $i >= 1 && $price === null; $i--) {
            $price = mp_parse_price($texts[$i]);
        }
        if ($price === null) continue;
        if (strpos($label, 'zestaw') !== false) $prices['zestaw'] = $price;
        elseif (strpos($label, 'zupa') !== false) $prices['zupa'] = $price;
        elseif (strpos($label, 'danie') !== false || strpos($label, 'drugie') !== false) $prices['drugie'] = $price;
    }
    return true;
}

function mp_empty_day($anchor) {
    return ['anchor' => $anchor, 'soup' => '', 'main' => '', 'dessert' => '', 'allergens' => '', 'noMeal' => false];
}

function mp_append(&$field, $text) {
    $text = trim($text);
    if ($text === '') return;
    $field = $field === '' ? $text : $field . ' | ' . $text;
}

// Dzień "wolny": komórka typu "DZIEŃ WOLNY" zamiast dań (np. scalona na całą szerokość)
function mp_mark_no_meal(array &$day, $extraText = '') {
    $dishTexts = array_values(array_filter([$day['soup'], $day['main']], 'strlen'));
    // Wszystkie wpisane "dania" to w rzeczywistości informacja o dniu wolnym
    $dishesAreNotes = $dishTexts && count(array_filter($dishTexts, function ($text) {
        return mp_is_no_meal($text) && mp_word_count($text) <= 8;
    })) === count($dishTexts);
    if ($dishesAreNotes || (!$dishTexts && mp_is_no_meal($extraText))) {
        $day['noMeal'] = true;
        $day['noMealReason'] = $dishesAreNotes ? $dishTexts[0] : trim($extraText);
        $day['soup'] = '';
        $day['main'] = '';
    }
}

function mp_parse_table(array $grid, array &$prices) {
    if (!$grid || mp_parse_price_table($grid, $prices)) return [];
    $text = function ($row, $col) { return isset($row[$col]) ? trim($row[$col]['text']) : ''; };

    // Układ odwrócony: wiersz z co najmniej dwoma dniami w kolumnach
    foreach (array_slice($grid, 0, 3, true) as $r => $row) {
        $anchorCols = [];
        foreach ($row as $c => $cell) {
            $cellText = trim($cell['text']);
            if ($cellText === '' || mp_word_count($cellText) > 5) continue;
            $anchor = mp_parse_anchor($cellText, true);
            if ($anchor) $anchorCols[$c] = $anchor;
        }
        if (count($anchorCols) >= 2) return mp_parse_transposed($grid, $r, $anchorCols);
    }

    // Nagłówek z nazwami kolumn (synonimy, literówki)
    $headerRow = -1;
    $roles = [];
    foreach (array_slice($grid, 0, 3, true) as $r => $row) {
        $map = [];
        $hasAnchor = false;
        foreach ($row as $c => $cell) {
            $cellText = trim($cell['text']);
            if ($cellText === '') continue;
            if (mp_parse_anchor($cellText, true)) {
                $hasAnchor = true;
                break;
            }
            if (mp_word_count($cellText) > 5) continue;
            $role = mp_role($cellText);
            if ($role !== null && $role !== 'ignore' && !in_array($role, $map, true)) $map[$c] = $role;
        }
        if (!$hasAnchor && count($map) >= 2) {
            $headerRow = $r;
            $roles = $map;
            break;
        }
    }
    if ($headerRow < 0) {
        // Bez nagłówka: dotychczasowy układ DZIEŃ, ZUPA, DRUGIE DANIE, DESER, ALERGENY
        $roles = [0 => 'day', 1 => 'soup', 2 => 'main', 3 => 'dessert', 4 => 'allergens'];
    }
    $dayCol = array_search('day', $roles, true);
    if ($dayCol === false) {
        // Nagłówek bez kolumny dnia: dzień jest w pierwszej kolumnie bez roli
        $width = count(reset($grid));
        for ($c = 0; $c < $width; $c++) {
            if (!isset($roles[$c])) {
                $dayCol = $c;
                break;
            }
        }
        if ($dayCol === false) return [];
    }

    $days = [];
    $current = null;
    foreach ($grid as $r => $row) {
        if ($r <= $headerRow) continue;
        $anchor = $text($row, $dayCol) !== '' ? mp_parse_anchor($text($row, $dayCol), true) : null;
        if (!$anchor) {
            // Kolejny wiersz tego samego dnia (np. deser w osobnym wierszu)
            if ($current !== null) {
                foreach ($roles as $c => $role) {
                    if (in_array($role, ['soup', 'main', 'dessert', 'allergens'], true)) mp_append($current[$role], $text($row, $c));
                }
            }
            continue;
        }
        if ($current !== null) $days[] = $current;
        $current = mp_empty_day($anchor);
        foreach ($roles as $c => $role) {
            if (in_array($role, ['soup', 'main', 'dessert', 'allergens'], true)) $current[$role] = $text($row, $c);
        }
        mp_mark_no_meal($current, $anchor['rest']);
    }
    if ($current !== null) $days[] = $current;
    return $days;
}

function mp_parse_transposed(array $grid, $headerRow, array $anchorCols) {
    $days = [];
    foreach ($anchorCols as $c => $anchor) {
        $days[$c] = mp_empty_day($anchor);
    }
    foreach ($grid as $r => $row) {
        if ($r <= $headerRow) continue;
        $label = '';
        foreach ($row as $c => $cell) {
            if (!isset($anchorCols[$c]) && trim($cell['text']) !== '') {
                $label = $cell['text'];
                break;
            }
        }
        $role = mp_role($label);
        if (!in_array($role, ['soup', 'main', 'dessert', 'allergens'], true)) continue;
        foreach ($anchorCols as $c => $anchor) {
            mp_append($days[$c][$role], isset($row[$c]) ? $row[$c]['text'] : '');
        }
    }
    foreach ($days as &$day) {
        mp_mark_no_meal($day, $day['anchor']['rest']);
    }
    return array_values($days);
}

// ---------------------------------------------------------------
// Tekst: akapity, punkty, zwykłe linie (także z PDF i OCR)
// ---------------------------------------------------------------

function mp_clean_line($line) {
    $line = preg_replace('/[\x{00A0}\x{2007}\x{202F}]/u', ' ', $line);
    // Punktory i numeracja listy na początku linii
    $line = preg_replace('/^\s*(?:[•●▪■◦○·*>»\-–—]+|\d{1,2}[.)](?=\s+\p{L}))\s*/u', '', $line);
    // Co najmniej 3 spacje to granica kolumn (np. z OCR), 2 spacje to zwykła literówka
    $line = preg_replace('/ {3,}/u', "\t", $line);
    return trim(preg_replace('/ {2}/u', ' ', $line));
}

// Linie kończące opis dnia: nagłówki tygodni i tabel, legendy, cenniki
function mp_is_section_break($line) {
    $folded = mp_fold($line);
    foreach (['tydzien', 'legenda', 'cennik', 'uwaga', 'w cenie', 'jadlospis', 'uklad tygodniowy', 'wariant', 'smacznego', 'zastrzegamy', 'alergeny legenda', 'alergeny sa'] as $prefix) {
        if (strpos($folded, $prefix) === 0) return true;
    }
    // Legenda alergenów: "1 – zboża zawierające gluten"
    if (preg_match('/^\d{1,2}\s*[–—-]\s*\p{L}{3,}/u', $line) && !mp_parse_anchor($line)) return true;
    // Nagłówek tabeli przepisanej do tekstu: "DZIEŃ ZUPA DRUGIE DANIE DESER"
    $tokens = mp_tokens($line);
    if (count($tokens) <= 8) {
        $roles = [];
        foreach ($tokens as $token) {
            $role = mp_role($token);
            if (in_array($role, ['day', 'soup', 'main', 'dessert', 'allergens'], true)) $roles[$role] = true;
        }
        if (count($roles) >= 3) return true;
    }
    return false;
}

// "Zupa: pomidorowa", "II danie - kotlet", "Alergeny: 1,7" -> [rola, treść]
function mp_split_label($line) {
    if (preg_match('/^([\p{L}0-9 .+]{2,30}?)\s*[:\-–—]\s*(.*)$/u', $line, $m)) {
        $role = mp_role($m[1]);
        if (in_array($role, ['soup', 'main', 'dessert', 'allergens'], true) && mp_word_count($m[1]) <= 3) {
            return [$role, trim($m[2])];
        }
    }
    return [null, $line];
}

function mp_is_noise($line) {
    $folded = mp_fold($line);
    if ($folded === '') return true;
    if (preg_match('/^\d+\s*(ml|g|kg|l|kcal|szt)$/', $folded)) return true;   // sama gramatura
    if (mp_parse_price($line) !== null && mp_word_count($line) <= 3) return true; // sama cena
    return false;
}

function mp_classify_lines(array $lines, array &$day) {
    $free = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') continue;
        if (mp_is_allergen_list($line)) {
            $day['allergens'] = mp_clean_allergens($line);
            continue;
        }
        list($role, $content) = mp_split_label($line);
        if ($role === 'allergens') {
            $day['allergens'] = mp_clean_allergens($content);
            continue;
        }
        if ($role !== null) {
            mp_append($day[$role], mp_ucfirst($content));
            continue;
        }
        if (mp_role($line) === 'dessert' && mp_word_count($line) <= 2) {
            if ($day['dessert'] === '') $day['dessert'] = 'deser';
            continue;
        }
        if (mp_is_noise($line)) continue;
        $free[] = $line;
    }

    // Linie bez etykiety: zupę poznajemy po nazwie, potem drugie danie i krótki deser
    $soupIndex = null;
    if ($day['soup'] === '') {
        foreach ($free as $i => $line) {
            if (mp_looks_like_soup($line)) {
                $soupIndex = $i;
                break;
            }
        }
        if ($soupIndex === null && count($free) >= 2 && $day['main'] === '') $soupIndex = 0;
    }
    foreach ($free as $i => $line) {
        if ($i === $soupIndex) {
            $day['soup'] = $line;
        } elseif ($day['main'] !== '' && mp_looks_like_dessert($line)) {
            mp_append($day['dessert'], $line);
        } else {
            mp_append($day['main'], $line);
        }
    }
}

function mp_parse_lines(array $lines) {
    $days = [];
    $current = null;
    foreach ($lines as $rawLine) {
        foreach (preg_split('/\R/u', (string) $rawLine) as $line) {
            $line = mp_clean_line($line);
            if ($line === '') continue;
            if (mp_is_section_break($line)) {
                if ($current !== null) $days[] = $current;
                $current = null;
                continue;
            }
            $anchor = mp_parse_anchor($line);
            if ($anchor) {
                if ($current !== null) $days[] = $current;
                $current = ['anchor' => $anchor, 'lines' => []];
                // Treść w tej samej linii: kolumny z OCR (tabulatory, kilka spacji) albo " | "
                if ($anchor['rest'] !== '') {
                    foreach (preg_split('/\t+|\s\|\s/u',$anchor['rest']) as $part) {
                        $current['lines'][] = $part;
                    }
                }
                continue;
            }
            if ($current !== null) {
                foreach (preg_split('/\t+|\s\|\s/u',$line) as $part) {
                    $current['lines'][] = $part;
                }
            }
        }
    }
    if ($current !== null) $days[] = $current;

    $result = [];
    foreach ($days as $item) {
        $day = mp_empty_day($item['anchor']);
        mp_classify_lines($item['lines'], $day);
        mp_mark_no_meal($day, $item['anchor']['rest']);
        $result[] = $day;
    }
    return $result;
}

// ---------------------------------------------------------------
// Tabela przepisana do tekstu z zachowaniem odstępów (np. PDF -> TXT)
// ---------------------------------------------------------------

// Słowa linii z położeniem (numer znaku, nie bajtu)
function mp_words_with_positions($line) {
    preg_match_all('/\S+/u', $line, $matches, PREG_OFFSET_CAPTURE);
    $words = [];
    foreach ($matches[0] as $m) {
        $words[] = ['text' => $m[0], 'pos' => mb_strlen(substr($line, 0, $m[1]), 'UTF-8')];
    }
    return $words;
}

// Linia nagłówka tabeli ("DZIEŃ  ZUPA  DRUGIE DANIE  DESER  ALERGENY") -> początki kolumn
function mp_header_columns(array $words) {
    $columns = [];
    foreach ($words as $word) {
        $role = mp_role($word['text']);
        if (in_array($role, ['day', 'soup', 'main', 'dessert', 'allergens'], true) && !isset($columns[$role])) {
            $columns[$role] = $word['pos'];
        }
    }
    if (count($columns) < 3) return null;
    asort($columns);
    return $columns;
}

/**
 * Słowa linii przypisane do kolumn. Linię dzielimy na fragmenty oddzielone
 * co najmniej dwiema spacjami; fragment trafia do kolumny, nawet jeśli zaczyna
 * się kilka znaków przed nią (tekst z PDF bywa przesunięty), a słowa sklejone
 * pojedynczą spacją przechodzą do następnej kolumny, gdy zaczynają się na jej granicy.
 */
function mp_line_cells($line, array $columns) {
    $roles = array_keys($columns);
    $starts = array_values($columns);
    $cells = [];
    preg_match_all('/\S+(?: \S+)*/u', $line, $segments, PREG_OFFSET_CAPTURE);
    foreach ($segments[0] as $segment) {
        $segmentPos = mb_strlen(substr($line, 0, $segment[1]), 'UTF-8');
        // Ostatnia kolumna, która zaczyna się najwyżej 4 znaki za fragmentem
        $index = 0;
        foreach ($starts as $i => $start) {
            if ($start <= $segmentPos + 4) $index = $i;
        }
        foreach (mp_words_with_positions($segment[0]) as $word) {
            $position = $segmentPos + $word['pos'];
            while ($index + 1 < count($starts) && $position >= $starts[$index + 1] - 1) $index++;
            $cells[$roles[$index]][] = $word['text'];
        }
    }
    return $cells;
}

/**
 * Kolumny rozpoznajemy po położeniu słów z nagłówka, a zawinięte linie
 * komórek dopisujemy do bieżącego dnia. Nowy dzień zaczyna się, gdy
 * w kolumnie dnia pojawia się nazwa dnia albo data.
 */
function mp_parse_fixed_width(array $lines) {
    $days = [];
    $columns = null;
    $current = null;
    foreach ($lines as $rawLine) {
        $line = rtrim(str_replace("\t", '    ', (string) $rawLine));
        if (trim($line) === '') continue;
        $words = mp_words_with_positions($line);
        $header = mp_header_columns($words);
        if ($header !== null) {
            if ($current !== null) $days[] = $current;
            $current = null;
            $columns = $header;
            continue;
        }
        if ($columns === null) continue;
        if (mp_is_section_break(trim($line))) {
            if ($current !== null) $days[] = $current;
            $current = null;
            $columns = null;
            continue;
        }

        $cells = mp_line_cells($line, $columns);
        $dayText = isset($cells['day']) ? implode(' ', $cells['day']) : '';
        $anchor = $dayText !== '' ? mp_parse_anchor($dayText, true) : null;
        if ($anchor && $current !== null && $current['anchor']['day'] === null && $anchor['weekday'] === null) {
            // Data w drugiej linii komórki dnia ("CZWARTEK" / "03.09")
            $current['anchor']['day'] = $anchor['day'];
            $current['anchor']['month'] = $anchor['month'];
            $current['anchor']['year'] = $anchor['year'];
        } elseif ($anchor) {
            if ($current !== null) $days[] = $current;
            $current = mp_empty_day($anchor);
        }
        if ($current === null) continue;
        // Krótkie słowa ("g", "z") z końca zawiniętej linii drugiego dania, które
        // przez niedokładne położenie (OCR) trafiły do kolumny deseru
        if (!empty($cells['dessert']) && !empty($cells['main'])
            && max(array_map(function ($word) { return mb_strlen($word, 'UTF-8'); }, $cells['dessert'])) <= 2) {
            $cells['main'] = array_merge($cells['main'], $cells['dessert']);
            unset($cells['dessert']);
        }
        foreach (['soup', 'main', 'dessert', 'allergens'] as $role) {
            if (!empty($cells[$role])) {
                $text = implode(' ', $cells[$role]);
                $current[$role] = $current[$role] === '' ? $text : $current[$role] . ' ' . $text;
            }
        }
    }
    if ($current !== null) $days[] = $current;
    foreach ($days as &$day) {
        if ($day['allergens'] !== '' && mp_is_allergen_list(str_replace(' ', '', $day['allergens']))) {
            $day['allergens'] = mp_clean_allergens($day['allergens']);
        }
        mp_mark_no_meal($day, $day['anchor']['rest']);
    }
    return $days;
}

// Cennik zapisany tekstem: linie z "zupa" / "danie" / "zestaw" i ceną
function mp_parse_text_prices(array $lines) {
    $prices = [];
    $inPriceList = false;
    foreach ($lines as $line) {
        $folded = mp_fold($line);
        if ($folded === '') continue;
        if (strpos($folded, 'cennik') === 0 || (strpos($folded, 'wariant') !== false && strpos($folded, 'cena') !== false)) {
            $inPriceList = true;
            continue;
        }
        if (!$inPriceList) continue;
        $price = mp_parse_price($line);
        if ($price === null) continue;
        $tokens = explode(' ', $folded);
        if (in_array('zestaw', $tokens, true)) $prices['zestaw'] = $price;
        elseif (in_array('zupa', $tokens, true)) $prices['zupa'] = $price;
        elseif (in_array('danie', $tokens, true) || in_array('drugie', $tokens, true)) $prices['drugie'] = $price;
    }
    return $prices;
}

// ---------------------------------------------------------------
// Daty, rok i sprawdzenie wyniku
// ---------------------------------------------------------------

// Miesiąc i rok z tytułu dokumentu ("JADŁOSPIS – WRZESIEŃ 2026")
function mp_find_month_year($text) {
    $month = null;
    $year = null;
    foreach (array_slice(preg_split('/\R/u', $text), 0, 15) as $line) {
        if (preg_match_all('/(\p{L}{3,})\s*(?:[\s,\/–—-]\s*)?((?:19|20)\d{2})?/u', $line, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $found = mp_month($m[1]);
                if ($found === null) continue;
                // Pomijamy fragmenty typu "1–4 WRZEŚNIA" (zakres dni), wolimy nazwę z rokiem
                if ($month === null || (!$year && !empty($m[2]))) {
                    $month = $found;
                    $year = !empty($m[2]) ? (int) $m[2] : $year;
                }
            }
        }
        if ($month && $year) break;
    }
    return [$month, $year];
}

// Rok, w którym nazwy dni z jadłospisu zgadzają się z datami
function mp_guess_year(array $days, $month, $docYear) {
    $now = (int) date('Y');
    // Kolejność ma znaczenie przy remisie: najpierw rok z tytułu, potem najbliższe lata
    $candidates = array_unique(array_filter([$docYear, $now, $now - 1, $now + 1, $now - 2, $now - 3, $now - 4, $now - 5]));
    $best = null;
    $bestScore = -1;
    foreach ($candidates as $year) {
        $score = 0;
        foreach ($days as $day) {
            $a = $day['anchor'];
            if ($a['day'] === null || $a['weekday'] === null) continue;
            $m = $a['month'] ?: $month;
            if (checkdate($m, $a['day'], $year) && (int) date('N', mktime(12, 0, 0, $m, $a['day'], $year)) === $a['weekday']) $score++;
        }
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $year;
        }
    }
    if ($bestScore > 0 || $docYear) return $bestScore > 0 ? $best : $docYear;
    // Brak wskazówek: jak w script.js, rok najbliższy dzisiejszej dacie
    $currentMonth = (int) date('n');
    if ($month < $currentMonth && $currentMonth - $month > 6) return $now + 1;
    if ($month > $currentMonth && $month - $currentMonth > 6) return $now - 1;
    return $now;
}

function mp_format_day($timestamp) {
    return date('d.m', $timestamp);
}

/**
 * Ustala daty (także z samych nazw dni), łączy powtórzenia, sprawdza zgodność
 * nazw dni z datami i buduje wynik dla script.js. Zwraca null, gdy dni jest za mało.
 */
function mp_finalize(array $raw, $docText, $source, array $prices) {
    if (!$raw) return null;
    $warnings = [];
    list($docMonth, $docYear) = mp_find_month_year($docText);

    // Miesiąc jadłospisu: najczęstszy w datach, a bez dat ten z tytułu
    $monthCounts = [];
    foreach ($raw as $day) {
        if ($day['anchor']['month']) $monthCounts[$day['anchor']['month']] = ($monthCounts[$day['anchor']['month']] ?? 0) + 1;
    }
    arsort($monthCounts);
    $month = $monthCounts ? (int) key($monthCounts) : $docMonth;
    if (!$month) return null;
    $year = mp_guess_year($raw, $month, $docMonth === $month ? $docYear : null);

    $byDate = [];
    $inferred = [];
    $mismatches = [];
    $previous = null;
    foreach ($raw as $day) {
        $a = $day['anchor'];
        if ($a['day'] !== null) {
            $m = $a['month'] ?: $month;
            $y = $a['year'] ?: $year;
            if (!$a['year'] && $m - $month > 6) $y--;
            if (!$a['year'] && $month - $m > 6) $y++;
            if (!checkdate($m, $a['day'], $y)) {
                $warnings[] = sprintf('Pominięto nieprawidłową datę %02d.%02d.', $a['day'], $m);
                continue;
            }
            $timestamp = mktime(12, 0, 0, $m, $a['day'], $y);
            if ($a['weekday'] !== null && (int) date('N', $timestamp) !== $a['weekday']) {
                $mismatches[] = sprintf('%s (w jadłospisie „%s”, w kalendarzu %s)', mp_format_day($timestamp),
                    mb_strtolower($a['weekdayRaw'], 'UTF-8'), MP_WEEKDAY_LOWER[(int) date('N', $timestamp)]);
            }
        } else {
            // Sama nazwa dnia: najbliższy taki dzień po poprzednim (albo od początku miesiąca)
            $timestamp = $previous !== null ? $previous + 86400 : mktime(12, 0, 0, $month, 1, $year);
            for ($i = 0; $i < 7 && (int) date('N', $timestamp) !== $a['weekday']; $i++) {
                $timestamp += 86400;
            }
            $inferred[] = mp_format_day($timestamp);
        }
        $previous = $timestamp;
        $key = date('Y-m-d', $timestamp);
        if (isset($byDate[$key])) {
            foreach (['soup', 'main', 'dessert', 'allergens'] as $field) {
                if ($byDate[$key][$field] === '') $byDate[$key][$field] = $day[$field];
            }
            $byDate[$key]['noMeal'] = $byDate[$key]['noMeal'] && $day['noMeal'];
            $warnings[] = sprintf('Dzień %s występuje w jadłospisie kilka razy, wpisy połączono.', mp_format_day($timestamp));
            continue;
        }
        $day['timestamp'] = $timestamp;
        $byDate[$key] = $day;
    }
    ksort($byDate);

    if ($mismatches) {
        $warnings[] = 'Nazwa dnia nie zgadza się z datą: ' . implode('; ', $mismatches) . '. Przyjęto datę.';
    }
    if ($inferred) {
        $warnings[] = 'Jadłospis nie podaje dat, ustalono je z nazw dni tygodnia: ' . implode(', ', $inferred) . '. Sprawdź, czy się zgadzają.';
    }

    $days = [];
    $outside = [];
    $empty = [];
    $noMeal = [];
    foreach ($byDate as $day) {
        $label = mp_format_day($day['timestamp']);
        if ((int) date('n', $day['timestamp']) !== $month) {
            $outside[] = $label;
            continue;
        }
        if ($day['noMeal']) {
            $noMeal[] = $label . (!empty($day['noMealReason']) ? ' (' . $day['noMealReason'] . ')' : '');
            continue;
        }
        if ($day['soup'] === '' && $day['main'] === '') {
            $empty[] = $label;
            continue;
        }
        $days[] = [
            'date' => $label,
            'dayName' => MP_WEEKDAY_NAMES[(int) date('N', $day['timestamp'])],
            'zupa' => $day['soup'],
            'drugieDanie' => $day['main'],
            'deser' => $day['dessert'],
            'alergeny' => $day['allergens'],
        ];
    }
    if (count($days) < 2) return null;

    if ($outside) $warnings[] = 'Pominięto dni spoza miesiąca: ' . implode(', ', $outside) . '.';
    if ($empty) $warnings[] = 'Nie znaleziono nazw dań dla: ' . implode(', ', $empty) . '.';
    if ($noMeal) $warnings[] = 'Dni bez obiadu według jadłospisu: ' . implode(', ', $noMeal) . '.';

    // Dni robocze miesiąca, których w ogóle nie ma w jadłospisie
    $present = array_flip(array_merge(array_column($days, 'date'), array_map(function ($text) {
        return substr($text, 0, 5);
    }, $noMeal), $empty));
    $missing = [];
    $daysInMonth = (int) date('t', mktime(12, 0, 0, $month, 1, $year));
    for ($d = 1; $d <= $daysInMonth; $d++) {
        $timestamp = mktime(12, 0, 0, $month, $d, $year);
        if ((int) date('N', $timestamp) <= 5 && !isset($present[mp_format_day($timestamp)])) $missing[] = mp_format_day($timestamp);
    }
    if ($missing) {
        $warnings[] = 'Brak w jadłospisie: ' . implode(', ', $missing) . '. Te dni będą oznaczone jako dni bez obiadu.';
    }

    $result = ['Successful' => true, 'Format' => 'table', 'Source' => $source, 'Month' => $month, 'Year' => $year, 'Days' => $days];
    if ($prices) $result['Prices'] = $prices;
    if ($warnings) $result['Warnings'] = $warnings;
    return $result;
}

// ---------------------------------------------------------------
// Punkty wejścia
// ---------------------------------------------------------------

function mp_parse_docx($path, $source = 'docx') {
    $doc = mp_docx_read($path);
    if ($doc === null) return null;
    $prices = [];
    $raw = [];
    foreach ($doc['tables'] as $grid) {
        $raw = array_merge($raw, mp_parse_table($grid, $prices));
    }
    $result = mp_finalize($raw, $doc['text'], $source, $prices);
    if ($result === null) {
        // Bez tabel z dniami: jadłospis w akapitach, punktach albo polach tekstowych
        $result = mp_finalize(mp_parse_lines($doc['lines']), $doc['text'], $source . '+tekst', $prices);
    }
    return $result;
}

function mp_parse_text($text, $source = 'tekst') {
    $text = str_replace("\r", '', (string) $text);
    $lines = preg_split('/\n/u', $text);
    $prices = mp_parse_text_prices($lines);
    // Najpierw tabela z zachowanymi odstępami (PDF), potem zwykłe linie
    $result = mp_finalize(mp_parse_fixed_width($lines), $text, $source, $prices);
    if ($result === null) $result = mp_finalize(mp_parse_lines($lines), $text, $source, $prices);
    return $result;
}

// Typ pliku po zawartości (nie po rozszerzeniu nazwy)
function mp_detect_type($path) {
    $head = (string) file_get_contents($path, false, null, 0, 8);
    if (strncmp($head, '%PDF', 4) === 0) return 'pdf';
    if ($head === "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") return 'doc';
    if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) return 'jpg';
    if (strncmp($head, "\x89PNG", 4) === 0) return 'png';
    if (strncmp($head, 'PK', 2) === 0) {
        if (class_exists('ZipArchive')) {
            $zip = new ZipArchive();
            if ($zip->open($path) === true) {
                $isDocx = $zip->locateName('word/document.xml') !== false;
                $zip->close();
                return $isDocx ? 'docx' : 'zip';
            }
        }
        return 'docx';
    }
    $sample = (string) file_get_contents($path, false, null, 0, 4096);
    if (strncmp($sample, '{\\rtf', 5) === 0) return 'rtf';
    if ($sample !== '' && mb_check_encoding($sample, 'UTF-8') && !preg_match('/[\x00-\x08\x0E-\x1F]/', $sample)) return 'txt';
    return 'unknown';
}
