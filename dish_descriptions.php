<?php
// Opisy dań do dymków na stronie (dish_info.php).
//
// Każdy opis trafia do tabeli dish_descriptions i jest potem brany z bazy,
// więc o to samo danie pytamy zewnętrzną usługę tylko raz. Kolejność źródeł:
//   1. baza (opis już kiedyś pobrany),
//   2. AI przez API zgodne z OpenAI (domyślnie darmowy plan Groq, ai_config.php),
//   3. słownik z dish_seed.php (dokładna nazwa),
//   4. Wikipedia (hasło z rdzenia nazwy, np. „Barszcz ukraiński”).
// Opis ze słownika albo z Wikipedii zostaje zastąpiony opisem AI, gdy tylko
// AI jest skonfigurowane. Danie bez opisu zapisujemy jako „brak” i bez AI
// sprawdzamy je ponownie dopiero po tygodniu.

const DD_WIKI_API = 'https://pl.wikipedia.org/w/api.php';
const DD_USER_AGENT = 'ObiadyDeklaracja/1.0 (https://edubaza.free.nf/katolik/)';
const DD_AI_BATCH = 12;           // dań w jednym zapytaniu do AI
const DD_AI_BATCHES_PER_CALL = 2; // zapytań do AI na jedno wywołanie dish_info.php
const DD_RETRY_DAYS = 7;          // po ilu dniach szukać ponownie opisu, którego nie było

// Małe litery bez polskich znaków, tylko litery i cyfry ("Zupa  Pomidorowa," -> "zupa pomidorowa")
function dd_fold($text) {
    $text = mb_strtolower($text, 'UTF-8');
    $text = strtr($text, ['ą' => 'a', 'ć' => 'c', 'ę' => 'e', 'ł' => 'l', 'ń' => 'n', 'ó' => 'o', 'ś' => 's', 'ź' => 'z', 'ż' => 'z']);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $text));
}

// Nazwa dania bez gramatur i znaków z układu jadłospisu:
// "Krupnik z warzywami– 250 ml" -> "Krupnik z warzywami",
// "Gulasz z indyka– 100 g | kasza gryczana – 120 g" -> "Gulasz z indyka, kasza gryczana"
function dd_clean_name($name) {
    $name = str_replace(['|', '–', '—', ';'], ',', $name);
    // Bez \b na początku: w "marchewką100 g" litera i cyfra to oba znaki słowa
    $name = preg_replace('/(?<![\d.,])\d+(?:[.,]\d+)?\s*(?:g|ml|dag|kg|l|szt|sztuki|sztuka)\b\.?/iu', '', $name);
    $name = preg_replace('/\s+/u', ' ', $name);
    $name = preg_replace('/\s*,[\s,]*/u', ', ', $name);
    return trim($name, " ,.-\t\n");
}

function dd_key($cleanName) {
    return sha1(dd_fold($cleanName));
}

// -------------------------------------------------------
// Baza danych
// -------------------------------------------------------

function dd_ensure_tables($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS dish_descriptions (
        name_key CHAR(40) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        source VARCHAR(20) NOT NULL,
        detail VARCHAR(255) NULL,
        ai_checked TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS dish_ai_usage (
        day DATE NOT NULL PRIMARY KEY,
        requests INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function dd_db_load($conn, array $keys) {
    if (!$keys) return [];
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $stmt = $conn->prepare("SELECT name_key, description, source, ai_checked, UNIX_TIMESTAMP(updated_at) AS updated FROM dish_descriptions WHERE name_key IN ($placeholders)");
    $stmt->bind_param(str_repeat('s', count($keys)), ...$keys);
    $stmt->execute();
    $rows = [];
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $rows[$row['name_key']] = $row;
    }
    $stmt->close();
    return $rows;
}

function dd_db_save($conn, $key, $name, $description, $source, $detail, $aiChecked) {
    $name = mb_substr($name, 0, 255);
    $detail = $detail === null ? null : mb_substr($detail, 0, 255);
    $aiChecked = $aiChecked ? 1 : 0;
    $stmt = $conn->prepare("INSERT INTO dish_descriptions (name_key, name, description, source, detail, ai_checked)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE description = VALUES(description), source = VALUES(source),
            detail = VALUES(detail), ai_checked = GREATEST(ai_checked, VALUES(ai_checked)), updated_at = CURRENT_TIMESTAMP");
    $stmt->bind_param('sssssi', $key, $name, $description, $source, $detail, $aiChecked);
    $stmt->execute();
    $stmt->close();
}

// Dzienny limit zapytań do AI chroni darmowy plan przed wyczerpaniem
function dd_ai_quota_take($conn, $dailyLimit) {
    $stmt = $conn->prepare("SELECT requests FROM dish_ai_usage WHERE day = CURDATE()");
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row && (int)$row['requests'] >= $dailyLimit) return false;
    $conn->query("INSERT INTO dish_ai_usage (day, requests) VALUES (CURDATE(), 1) ON DUPLICATE KEY UPDATE requests = requests + 1");
    return true;
}

// -------------------------------------------------------
// Konfiguracja AI
// -------------------------------------------------------

function dd_load_ai_config() {
    $config = file_exists(__DIR__ . '/ai_config.php') ? include __DIR__ . '/ai_config.php' : [];
    if (!is_array($config)) $config = [];
    $key = getenv('GROQ_API_KEY') ?: ($config['api_key'] ?? '');
    if (!$key || strpos($key, 'TWOJ_') === 0) return null;
    return [
        'api_key' => $key,
        'url' => $config['url'] ?? 'https://api.groq.com/openai/v1/chat/completions',
        'models' => $config['models'] ?? ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
        'daily_limit' => (int)($config['daily_limit'] ?? 300),
    ];
}

// -------------------------------------------------------
// AI
// -------------------------------------------------------

const DD_AI_INSTRUCTIONS = <<<'TXT'
Piszesz krótkie opisy dań ze szkolnego jadłospisu dla rodziców, którzy wybierają obiady dla dziecka i chcą wiedzieć, co dziecko dostanie na talerzu.
Zasady:
- Po polsku, 1 lub 2 zdania, najwyżej 220 znaków.
- Nie powtarzaj samej nazwy dania ani listy dodatków. Wyjaśnij, czym jest danie: z czego się je robi, jak się je przyrządza (smażone, pieczone, duszone, gotowane, zmiksowane) i jaki ma charakter (np. słodkie, łagodne, kremowe).
- Objaśniaj mniej znane nazwy i określenia, np. sos beszamelowy (z mleka, masła i mąki), sos Napoli (pomidorowy z ziołami), warzywa królewskie (mieszanka m.in. marchewki, kalafiora i brokułu), zupa nic (słodka zupa mleczna z pianką z białek).
- Przy niektórych daniach jest fragment z Wikipedii o potrawie podstawowej. Korzystaj z niego, ale opisuj danie z jadłospisu (np. jego wersję na wywarze warzywnym). Jeśli fragment dotyczy innej potrawy, pomiń go.
- Przy zestawie (danie główne, ziemniaki, surówka) opisz przede wszystkim danie główne; dodatki wspomnij krótko tylko wtedy, gdy wymagają wyjaśnienia.
- Nazwy mogą mieć literówki, brakujące polskie znaki albo sklejone słowa. Odczytaj najbardziej prawdopodobne danie. Nazwy żartobliwe dla dzieci (np. "zupa Shrekowa") opisz po tym, co zwykle oznaczają. Pisz, że nazwa jest żartobliwa, tylko gdy nawiązuje do bajki albo postaci; "zupa nic" to tradycyjna nazwa.
- Nie zaczynaj od nazwy dania. Nie wymyślaj alergenów, kaloryczności ani pochodzenia; typowy skład opisz słowem "zwykle".
- Bez przymiotników reklamowych (pyszny, idealny, wyśmienity, soczysty), bez emoji, bez myślników.
- Jeśli tekst nie jest nazwą potrawy (np. "dzień wolny", "wycieczka", "deser"), zwróć pusty opis.
Przykłady:
[drugie danie] Kotlet pożarski, ziemniaki, surówka -> "Panierowany kotlet z mielonego mięsa drobiowego, smażony na złoto, podawany z gotowanymi ziemniakami i surówką ze świeżych warzyw."
[zupa] Zupa krem z dyni -> "Gładka, zmiksowana zupa z dyni, zwykle z marchewką i cebulą, o łagodnym, lekko słodkim smaku."
Odpowiedz wyłącznie obiektem JSON w postaci {"opisy":[{"id":1,"opis":"..."}]} z opisem dla każdego id.
TXT;

// Parametry zależne od rodziny modelu (Groq): bez rozumowania, sama odpowiedź
function dd_ai_model_params($model) {
    if (strpos($model, 'gpt-oss') !== false) return ['reasoning_effort' => 'medium', 'include_reasoning' => false];
    if (strpos($model, 'qwen') !== false) return ['reasoning_effort' => 'none'];
    return [];
}

function dd_ai_http($url, $apiKey, array $body, &$status, &$error) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 40,
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return $response === false ? null : $response;
}

// Z odpowiedzi modelu wyciąga {"opisy":[...]}, także gdy JSON jest otoczony tekstem
function dd_ai_parse($content) {
    $content = preg_replace('/<think>.*?<\/think>/s', '', (string)$content);
    $start = strpos($content, '{');
    $end = strrpos($content, '}');
    if ($start === false || $end === false || $end < $start) return null;
    $data = json_decode(substr($content, $start, $end - $start + 1), true);
    if (!is_array($data)) return null;
    $list = $data['opisy'] ?? $data['descriptions'] ?? null;
    if (!is_array($list)) return null;
    $result = [];
    foreach ($list as $item) {
        if (is_array($item) && isset($item['id'])) {
            $result[(int)$item['id']] = dd_tidy_text((string)($item['opis'] ?? $item['description'] ?? ''));
        }
    }
    return $result;
}

// Wspólne porządki tekstu opisu: bez myślników, cudzysłowów na brzegach i podwójnych spacji
function dd_tidy_text($text) {
    $text = trim($text, " \t\n\"'„”«»");
    $text = preg_replace('/\s+[–—]\s+/u', ', ', $text);
    $text = str_replace(['–', '—'], '-', $text);
    $text = preg_replace('/\s+/u', ' ', $text);
    $text = preg_replace('/\s+([,.;:!?])/u', '$1', $text);
    $text = preg_replace('/([,;])(?=\p{L})/u', '$1 ', $text);
    if ($text !== '' && !preg_match('/[.!?]$/u', $text)) $text .= '.';
    return $text;
}

/**
 * Opisuje dania przez AI. $items: id => ['name' => ..., 'kind' => 'zupa'|'drugie', 'hint' => fragment z Wikipedii|null].
 * Zwraca id => opis ('' gdy model uznał, że to nie jest potrawa).
 * Dania, dla których nie ma odpowiedzi (błąd, limit), nie występują w wyniku.
 */
function dd_ai_describe(array $items, array $config, &$log, &$model) {
    $lines = [];
    foreach ($items as $id => $item) {
        $label = $item['kind'] === 'zupa' ? 'zupa' : 'drugie danie';
        $lines[] = "$id. [$label] {$item['name']}" . (empty($item['hint']) ? '' : "
   Wikipedia: {$item['hint']}");
    }
    $messages = [
        ['role' => 'system', 'content' => DD_AI_INSTRUCTIONS],
        ['role' => 'user', 'content' => "Dania:\n" . implode("\n", $lines)],
    ];
    foreach ($config['models'] as $candidate) {
        $body = ['model' => $candidate, 'messages' => $messages, 'temperature' => 0.3, 'max_tokens' => 6000] + dd_ai_model_params($candidate);
        $response = dd_ai_http($config['url'], $config['api_key'], $body, $status, $error);
        if ($response === null) {
            $log[] = "AI $candidate: $error";
            return [];
        }
        $data = json_decode($response, true);
        if ($status !== 200) {
            $message = $data['error']['message'] ?? ('HTTP ' . $status);
            $log[] = "AI $candidate: HTTP $status " . mb_substr($message, 0, 160);
            // Model wycofany albo niedostępny w planie: próbujemy następnego z listy
            if (in_array($status, [400, 403, 404], true) && stripos($message, 'model') !== false) continue;
            return [];
        }
        $parsed = dd_ai_parse($data['choices'][0]['message']['content'] ?? '');
        if ($parsed === null) {
            $log[] = "AI $candidate: odpowiedź bez poprawnego JSON";
            return [];
        }
        $model = $candidate;
        // Pominięte id: model uznał, że to nie potrawa (inaczej pytalibyśmy o nie przy każdym wyświetleniu)
        return array_intersect_key($parsed, $items) + array_fill_keys(array_keys($items), '');
    }
    return [];
}

// -------------------------------------------------------
// Słownik
// -------------------------------------------------------

function dd_seed() {
    static $seed = null;
    if ($seed === null) {
        $seed = [];
        $entries = file_exists(__DIR__ . '/dish_seed.php') ? include __DIR__ . '/dish_seed.php' : [];
        foreach ($entries as $name => $description) {
            $seed[dd_fold($name)] = $description;
        }
    }
    return $seed;
}

// -------------------------------------------------------
// Wikipedia
// -------------------------------------------------------

// Pojedyncze słowa zbyt ogólne, by opisywały konkretne danie ("Kotlet z kalafiora" to nie "Kotlet")
const DD_WIKI_GENERIC = ['zupa', 'krem', 'kotlet', 'kotlety', 'kotleciki', 'danie', 'potrawa', 'obiad', 'sos', 'ryba',
    'mieso', 'makaron', 'kasza', 'ryz', 'ziemniak', 'ziemniaki', 'surowka', 'salatka', 'warzywa', 'schab', 'kurczak',
    'indyk', 'filet', 'mintaj', 'placki', 'gulasz', 'burger', 'burgery', 'pulpet', 'pulpety', 'klops', 'klopsiki'];

const DD_PREPOSITIONS = ['z', 'ze', 'w', 'we', 'na', 'po', 'i', 'oraz', 'od', 'do', 'bez', 'a'];

// Słowa, które zaczynają zupę bez słowa "zupa": "Kalafiorowa z ziemniakami" -> "Zupa kalafiorowa"
function dd_is_soup_adjective($word) {
    return (bool)preg_match('/(owa|owy|na|ny)$/u', mb_strtolower($word, 'UTF-8'));
}

function dd_title($words) {
    $text = mb_strtolower(implode(' ', $words), 'UTF-8');
    return mb_strtoupper(mb_substr($text, 0, 1, 'UTF-8'), 'UTF-8') . mb_substr($text, 1, null, 'UTF-8');
}

// Możliwe tytuły haseł, od najbardziej szczegółowego
function dd_wiki_candidates($cleanName, $kind) {
    $first = trim(explode(',', $cleanName)[0]);
    $words = preg_split('/\s+/u', preg_replace('/[^\p{L}\p{N}\s-]/u', ' ', $first), -1, PREG_SPLIT_NO_EMPTY);
    if (!$words) return [];
    $variants = [];
    $head = dd_fold($words[0]);
    if (in_array($head, ['zupa', 'krem'], true) && count($words) > 1 && !dd_is_soup_adjective($words[1])) {
        $variants[] = array_slice($words, 1);   // "Zupa Barszcz ukraiński" -> "Barszcz ukraiński"
    }
    if ($kind === 'zupa' && !in_array($head, ['zupa', 'krem'], true) && dd_is_soup_adjective($words[0])) {
        $variants[] = array_merge(['zupa'], $words); // "Kalafiorowa" -> "Zupa kalafiorowa"
    }
    $variants[] = $words;
    $titles = [];
    foreach ($variants as $variant) {
        for ($length = min(4, count($variant)); $length >= 1; $length--) {
            $part = array_slice($variant, 0, $length);
            if (in_array(dd_fold(end($part)), DD_PREPOSITIONS, true)) continue;
            if ($length === 1 && in_array(dd_fold($part[0]), DD_WIKI_GENERIC, true)) continue;
            $title = dd_title($part);
            $titles[] = $title;
            if ($length === 1) $titles[] = $title . ($kind === 'zupa' ? ' (zupa)' : ' (potrawa)');
        }
    }
    return array_values(array_unique($titles));
}

// Czy wstęp hasła opisuje jedzenie, a nie np. wieś albo gatunek rośliny
function dd_wiki_is_food($extract) {
    $start = mb_strtolower(mb_substr($extract, 0, 220, 'UTF-8'), 'UTF-8');
    if (preg_match('/(?<!\p{L})(wieś|miejscowość|gatunek|film|gmina|osada|rzeka|nazwisko|album|zespół|serial|powieść|herb|stacja|singel|polityk)(?!\p{L})/u', $start)) return false;
    return (bool)preg_match('/potraw|zup|dani|kuchni|klus|pierog|placek|plack|kotlet|makaron|kasz|ciast|deser|sos|napój|mięs|wywar|smaż|gotow|piecz|dusz|bulion|farsz|nadzien/u', $start);
}

// Pierwsze zdania wstępu bez nawiasów (wymowa, etymologia), z dwukropkiem zamiast myślnika
function dd_wiki_summary($extract) {
    $text = $extract;
    do {
        $previous = $text;
        $text = preg_replace('/\s*\([^()]*\)/u', '', $text);
    } while ($text !== $previous);
    $text = preg_replace('/\s+/u', ' ', trim($text));
    $text = preg_replace('/\s+[–—]\s+/u', ': ', $text, 1);
    // Pierwsze zdanie; drugie tylko wtedy, gdy pierwsze jest bardzo krótkie (dalej bywa historia nazwy)
    $sentences = preg_split('/(?<=[.!?])\s+(?=\p{Lu})/u', $text);
    $summary = $sentences[0];
    if (mb_strlen($summary, 'UTF-8') < 80 && isset($sentences[1]) && mb_strlen($summary . ' ' . $sentences[1], 'UTF-8') <= 230) {
        $summary .= ' ' . $sentences[1];
    }
    if (mb_strlen($summary, 'UTF-8') > 260) {
        $cut = mb_substr($summary, 0, 240, 'UTF-8');
        $comma = mb_strrpos($cut, ',', 0, 'UTF-8');
        $summary = $comma > 120 ? mb_substr($cut, 0, $comma, 'UTF-8') : $cut;
    }
    return dd_tidy_text($summary);
}

// Pobiera wstępy haseł dla wielu tytułów naraz (po 20, tyle zwraca API).
// Po kolei, bo hosting (InfinityFree) wyłącza curl_multi_exec.
function dd_wiki_fetch(array $titles, &$log) {
    $pages = [];
    $started = microtime(true);
    foreach (array_chunk($titles, 20) as $chunk) {
        if (microtime(true) - $started > 15) {
            $log[] = 'Wikipedia: przerwano, zbyt długie oczekiwanie';
            break;
        }
        $url = DD_WIKI_API . '?' . http_build_query([
            'action' => 'query', 'prop' => 'extracts|pageprops', 'exintro' => 1, 'explaintext' => 1,
            'exchars' => 700, 'exlimit' => 20, 'redirects' => 1, 'format' => 'json', 'formatversion' => 2,
            'titles' => implode('|', $chunk),
        ]);
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_USERAGENT => DD_USER_AGENT, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 10]);
        $data = json_decode((string)curl_exec($ch), true);
        if (!isset($data['query'])) {
            $log[] = 'Wikipedia: brak odpowiedzi (' . (curl_error($ch) ?: 'HTTP ' . curl_getinfo($ch, CURLINFO_HTTP_CODE)) . ')';
            curl_close($ch);
            continue;
        }
        curl_close($ch);
        // Tytuł z zapytania -> tytuł hasła po normalizacji i przekierowaniu
        $target = [];
        foreach ($data['query']['normalized'] ?? [] as $n) $target[$n['from']] = $n['to'];
        $redirect = [];
        foreach ($data['query']['redirects'] ?? [] as $r) $redirect[$r['from']] = $r['to'];
        $byTitle = [];
        foreach ($data['query']['pages'] ?? [] as $page) {
            if (!empty($page['missing']) || isset($page['pageprops']['disambiguation']) || empty($page['extract'])) continue;
            $byTitle[$page['title']] = $page;
        }
        foreach ($chunk as $asked) {
            $title = $target[$asked] ?? $asked;
            $title = $redirect[$title] ?? $title;
            if (isset($byTitle[$title])) $pages[$asked] = $byTitle[$title];
        }
    }
    return $pages;
}

/**
 * Opisy z Wikipedii. $items: id => ['name' => ..., 'kind' => ...].
 * Zwraca id => ['text' => ..., 'title' => ...] tylko dla znalezionych dań.
 */
function dd_wiki_describe(array $items, &$log) {
    $candidates = [];
    foreach ($items as $id => $item) {
        $candidates[$id] = dd_wiki_candidates($item['name'], $item['kind']);
    }
    $all = $candidates ? array_values(array_unique(array_merge(...array_values($candidates)))) : [];
    if (!$all) return [];
    $pages = dd_wiki_fetch($all, $log);
    $result = [];
    foreach ($candidates as $id => $titles) {
        foreach ($titles as $title) {
            $page = $pages[$title] ?? null;
            if ($page && dd_wiki_is_food($page['extract'])) {
                $result[$id] = ['text' => dd_wiki_summary($page['extract']), 'title' => $page['title']];
                break;
            }
        }
    }
    return $result;
}

// Wikipedia dla dań jeszcze niesprawdzonych; wyniki dopisuje do $hits, sprawdzone klucze do $checked
function dd_wiki_lookup(array $dishes, array &$hits, array &$checked, &$log) {
    $keys = array_values(array_diff(array_keys($dishes), array_keys($checked)));
    if (!$keys) return;
    $items = [];
    foreach ($keys as $i => $key) $items[$i + 1] = ['name' => $dishes[$key]['clean'], 'kind' => $dishes[$key]['kind']];
    $found = dd_wiki_describe($items, $log);
    foreach ($keys as $i => $key) {
        $checked[$key] = true;
        if (isset($found[$i + 1])) $hits[$key] = $found[$i + 1];
    }
}

// -------------------------------------------------------
// Całość
// -------------------------------------------------------

/**
 * $requests: lista ['name' => tekst z tabeli, 'kind' => 'zupa'|'drugie'].
 * Zwraca [name => ['text' => opis|null, 'source' => 'ai'|'slownik'|'wikipedia'|'brak']]
 * oraz statystyki w $stats.
 */
function dd_describe($conn, array $requests, &$stats, &$log) {
    $stats = ['baza' => 0, 'ai' => 0, 'slownik' => 0, 'wikipedia' => 0, 'brak' => 0];
    $log = [];
    $ai = dd_load_ai_config();

    // Unikalne dania (po kluczu z nazwy bez gramatur i polskich znaków)
    $dishes = [];
    foreach ($requests as $request) {
        $clean = dd_clean_name($request['name']);
        if (!preg_match('/\p{L}{3}/u', $clean)) continue;
        $key = dd_key($clean);
        $dishes[$key] = $dishes[$key] ?? ['clean' => $clean, 'kind' => $request['kind'], 'names' => []];
        $dishes[$key]['names'][] = $request['name'];
    }

    $found = [];   // key => ['text', 'source']
    $wikiHits = [];    // key => ['text', 'title'] z Wikipedii
    $wikiChecked = []; // key => true, gdy Wikipedia była już sprawdzona
    $fresh = [];   // key => true dla opisów pobranych w tym wywołaniu
    $cached = [];
    if ($conn) {
        dd_ensure_tables($conn);
        $cached = dd_db_load($conn, array_keys($dishes));
    }

    $todo = [];    // key => dish, dla których szukamy (nowego) opisu
    foreach ($dishes as $key => $dish) {
        $row = $cached[$key] ?? null;
        $upgrade = $row && $ai && !$row['ai_checked'];
        $retry = $row && $row['source'] === 'brak' && !$ai && time() - (int)$row['updated'] > DD_RETRY_DAYS * 86400;
        if ($row && ($row['description'] !== null || !$upgrade)) {
            $found[$key] = ['text' => $row['description'], 'source' => $row['source']];
        }
        if (!$row || $upgrade || $retry) $todo[$key] = $dish;
    }

    // AI tylko z bazą: bez zapisu każde wyświetlenie strony zużywałoby zapytania
    if ($todo && $ai && $conn) {
        // Kilku rodziców otwiera nowy jadłospis naraz: o te same dania pyta tylko pierwszy
        try {
            $locked = (int)($conn->query("SELECT GET_LOCK('dish_descriptions_ai', 25) AS l")->fetch_assoc()['l'] ?? 0) === 1;
        } catch (Exception $e) {
            $locked = false;
        }
        // Ktoś inny mógł w międzyczasie opisać te same dania
        foreach (dd_db_load($conn, array_keys($todo)) as $key => $row) {
            if ($row['ai_checked']) {
                $found[$key] = ['text' => $row['description'], 'source' => $row['source']];
                unset($todo[$key]);
            }
        }
        $batches = array_slice(array_chunk(array_keys($todo), DD_AI_BATCH), 0, DD_AI_BATCHES_PER_CALL);
        // Fragment z Wikipedii pomaga AI trafić w skład klasycznych potraw (np. barszcz ukraiński)
        if ($batches) dd_wiki_lookup(array_intersect_key($todo, array_flip(array_merge(...$batches))), $wikiHits, $wikiChecked, $log);
        foreach ($batches as $keys) {
            if (!dd_ai_quota_take($conn, $ai['daily_limit'])) {
                $log[] = 'AI: wykorzystany dzienny limit zapytań';
                break;
            }
            $items = [];
            foreach ($keys as $i => $key) {
                $items[$i + 1] = ['name' => $todo[$key]['clean'], 'kind' => $todo[$key]['kind'], 'hint' => $wikiHits[$key]['text'] ?? null];
            }
            $model = null;
            $answers = dd_ai_describe($items, $ai, $log, $model);
            if (!$answers) break;
            foreach ($answers as $id => $text) {
                $key = $keys[$id - 1];
                $hasText = $text !== '';
                dd_db_save($conn, $key, $todo[$key]['clean'], $hasText ? $text : null, $hasText ? 'ai' : 'brak', $model, true);
                $found[$key] = ['text' => $hasText ? $text : null, 'source' => $hasText ? 'ai' : 'brak'];
                $fresh[$key] = true;
                unset($todo[$key]);
            }
        }
        if ($locked) $conn->query("SELECT RELEASE_LOCK('dish_descriptions_ai')");
    }

    // Bez AI (albo gdy AI nie odpowiedziało): słownik, potem Wikipedia, tylko dla dań bez opisu
    $todo = array_filter($todo, function ($key) use ($found) {
        return !isset($found[$key]['text']);
    }, ARRAY_FILTER_USE_KEY);
    $seed = dd_seed();
    $wikiTodo = [];
    foreach ($todo as $key => $dish) {
        $folded = dd_fold($dish['clean']);
        // Zupy w jadłospisie często są bez słowa "zupa" ("Kalafiorowa z ziemniakami")
        if (!isset($seed[$folded]) && $dish['kind'] === 'zupa' && isset($seed['zupa ' . $folded])) $folded = 'zupa ' . $folded;
        if (isset($seed[$folded])) {
            $found[$key] = ['text' => $seed[$folded], 'source' => 'slownik'];
            $fresh[$key] = true;
            if ($conn) dd_db_save($conn, $key, $dish['clean'], $seed[$folded], 'slownik', null, false);
            continue;
        }
        $wikiTodo[$key] = $dish;
    }
    if ($wikiTodo) {
        dd_wiki_lookup($wikiTodo, $wikiHits, $wikiChecked, $log);
        foreach ($wikiTodo as $key => $dish) {
            $hit = $wikiHits[$key] ?? null;
            $found[$key] = $hit ? ['text' => $hit['text'], 'source' => 'wikipedia'] : ['text' => null, 'source' => 'brak'];
            $fresh[$key] = true;
            if ($conn) {
                $detail = $hit ? 'https://pl.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $hit['title'])) : null;
                dd_db_save($conn, $key, $dish['clean'], $hit['text'] ?? null, $hit ? 'wikipedia' : 'brak', $detail, false);
            }
        }
    }

    $result = [];
    foreach ($dishes as $key => $dish) {
        $stats[isset($fresh[$key]) ? ($found[$key]['source'] ?? 'brak') : 'baza']++;
        foreach ($dish['names'] as $name) {
            $result[$name] = $found[$key] ?? ['text' => null, 'source' => 'brak'];
        }
    }
    return $result;
}
