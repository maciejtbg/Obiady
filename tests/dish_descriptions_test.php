<?php
// Testy opisów dań bez sieci i bazy: php tests/dish_descriptions_test.php
require __DIR__ . '/../dish_descriptions.php';

$failed = 0;
function check($label, $actual, $expected) {
    global $failed;
    if ($actual === $expected) {
        echo "OK    $label\n";
    } else {
        $failed++;
        echo "BŁĄD  $label\n      jest:    " . json_encode($actual, JSON_UNESCAPED_UNICODE) . "\n      powinno: " . json_encode($expected, JSON_UNESCAPED_UNICODE) . "\n";
    }
}

// Nazwy z jadłospisu bez gramatur, ten sam klucz dla zapisu z literówką w spacjach i bez polskich znaków
check('gramatura', dd_clean_name('Krupnik z warzywami– 250 ml'), 'Krupnik z warzywami');
check('gramatura sklejona z wyrazem', dd_clean_name('surówka z kapusty z marchewką100 g'), 'surówka z kapusty z marchewką');
check('dodatki po kresce', dd_clean_name('Gulasz z indyka– 100 g | kasza gryczana – 120 g, buraczki – 100 g'), 'Gulasz z indyka, kasza gryczana, buraczki');
check('przecinek z myślnikiem', dd_clean_name('Zupa jarzynowa,– 250 ml'), 'Zupa jarzynowa');
check('ten sam klucz', dd_key(dd_clean_name('Zupa  Pomidorowa z makaronem – 250 ml')), dd_key(dd_clean_name('zupa pomidorowa z makaronem')));
check('klucz bez polskich znaków', dd_key('Pierogi z mięsem'), dd_key('Pierogi z miesem'));

// Odpowiedź AI: JSON otoczony tekstem, rozumowanie w <think>, myślniki zamienione na przecinki
check('AI czysty JSON', dd_ai_parse('{"opisy":[{"id":1,"opis":"Zupa z buraków – na wywarze"},{"id":2,"opis":""}]}'), [1 => 'Zupa z buraków, na wywarze.', 2 => '']);
check('AI z <think> i blokiem kodu', dd_ai_parse("<think>x</think>\n```json\n{\"opisy\":[{\"id\":\"3\",\"opis\":\"Kluski,z twarogu\"}]}\n```"), [3 => 'Kluski, z twarogu.']);
check('AI bez JSON', dd_ai_parse('Nie wiem'), null);

// Hasła Wikipedii: rdzeń nazwy, "zupa" przed przymiotnikiem, bez ogólnych słów
check('zupa z nazwą własną', array_slice(dd_wiki_candidates('Zupa Barszcz ukraiński, wywar warzywny', 'zupa'), 0, 3), ['Barszcz ukraiński', 'Barszcz', 'Barszcz (zupa)']);
check('zupa bez słowa zupa', in_array('Zupa kalafiorowa', dd_wiki_candidates('Kalafiorowa z ziemniakami', 'zupa'), true), true);
check('bez ogólnego "Kotlet"', array_values(array_filter(dd_wiki_candidates('Kotlet z kalafiora', 'drugie'), function ($t) { return strpos($t, 'Kotlet') === 0 && strpos($t, ' ') === false; })), []);
check('bez tytułu kończącego się przyimkiem', in_array('Krupnik z', dd_wiki_candidates('Krupnik z warzywami', 'zupa'), true), false);

// Wstęp hasła: bez nawiasów, dwukropek zamiast myślnika, jedno zdanie (dwa, gdy pierwsze jest krótkie)
check('streszczenie hasła', dd_wiki_summary('Kapuśniak (z ruskiego) – zupa z poszatkowanej kapusty głowiastej (świeżej lub kiszonej) i warzyw, często na wywarze z boczku. Znana w kuchni polskiej (kwaśnica).'), 'Kapuśniak: zupa z poszatkowanej kapusty głowiastej i warzyw, często na wywarze z boczku.');
check('krótkie pierwsze zdanie z drugim', dd_wiki_summary('Rosół – zupa z mięsa. Podawany z makaronem.'), 'Rosół: zupa z mięsa. Podawany z makaronem.');
check('hasło o jedzeniu', dd_wiki_is_food('Barszcz ukraiński – zupa gotowana na bulionie'), true);
check('wieś to nie jedzenie', dd_wiki_is_food('Pyzy – wieś w Polsce położona w województwie podlaskim'), false);
check('roślina to nie danie', dd_wiki_is_food('Psianka ziemniak – gatunek rośliny należący do rodziny psiankowatych'), false);

// Słownik: opis także dla zupy zapisanej bez słowa "zupa"
$result = dd_describe(null, [['name' => 'Kalafiorowa z ziemniakami– 250 ml', 'kind' => 'zupa']], $stats, $log);
check('słownik dla zupy bez słowa zupa', $result['Kalafiorowa z ziemniakami– 250 ml']['source'], 'slownik');

exit($failed ? 1 : 0);
