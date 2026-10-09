<?php
// Testy parsera jadłospisu: php tests/run_tests.php
// Porównuje wynik dla każdego pliku z tests/files z zapisanym wzorcem w tests/expected.
// Z parametrem --update zapisuje bieżące wyniki jako nowe wzorce (po świadomej zmianie parsera).
require __DIR__ . '/../menu_parser.php';

$update = in_array('--update', $argv, true);
$failed = 0;
foreach (glob(__DIR__ . '/files/*') as $path) {
    $name = basename($path);
    $type = mp_detect_type($path);
    $result = $type === 'docx' ? mp_parse_docx($path) : mp_parse_text(file_get_contents($path));
    $actual = $result === null ? null : [
        'Month' => $result['Month'], 'Year' => $result['Year'], 'Days' => $result['Days'],
        'Prices' => $result['Prices'] ?? null, 'Warnings' => $result['Warnings'] ?? [],
    ];
    $expectedFile = __DIR__ . '/expected/' . $name . '.json';
    if ($update) {
        file_put_contents($expectedFile, json_encode($actual, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n");
        echo "zapisano wzorzec: $name\n";
        continue;
    }
    $expected = is_file($expectedFile) ? json_decode(file_get_contents($expectedFile), true) : 'brak wzorca';
    if ($expected === $actual) {
        echo "OK    $name (" . count($actual['Days'] ?? []) . " dni)\n";
    } else {
        $failed++;
        echo "BŁĄD  $name\n";
    }
}
exit($failed ? 1 : 0);
