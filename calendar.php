<?php
// calendar.php - przypomnienia o wpłacie i kolejnej deklaracji jako plik kalendarza (.ics).
// Daty przypomnień liczy strona (script.js, getReminderPlan); tu je sprawdzamy i składamy
// wydarzenia. iPhone po otwarciu takiego adresu proponuje dodanie ich do Kalendarza,
// a Outlook i inne kalendarze otwierają pobrany plik.
//
// Parametry: m, r (miesiąc i rok deklaracji), kwota, w + wt (przypomnienie i termin
// wpłaty: RRRRMMDDGGMM, RRRRMMDD), d + dt (przypomnienie i termin deklaracji).

date_default_timezone_set('Europe/Warsaw');
header('Cache-Control: no-store');

const CAL_MONTHS = ['', 'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec',
    'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const CAL_WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const CAL_SCHOOL_EMAIL = 'agnieszkakupczyk@katolik.info.pl';

function cal_fail($text) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo $text;
    exit;
}

function cal_date($value, $withTime) {
    $format = $withTime ? 'YmdHi' : 'Ymd';
    if (!is_string($value) || !preg_match($withTime ? '/^\d{12}$/' : '/^\d{8}$/', $value)) return null;
    $date = DateTime::createFromFormat('!' . $format, $value);
    return ($date && $date->format($format) === $value) ? $date : null;
}

// Daty muszą być blisko miesiąca deklaracji (nie da się tu wstawić dowolnych wydarzeń)
function cal_near($date, DateTime $start) {
    $days = ($date->getTimestamp() - $start->getTimestamp()) / 86400;
    return $days > -45 && $days < 75;
}

function cal_escape($text) {
    return str_replace(['\\', ';', ',', "\r\n", "\n"], ['\\\\', '\\;', '\\,', '\\n', '\\n'], $text);
}

// Wiersze pliku najwyżej po 75 bajtów, dalszy ciąg od spacji (wymóg formatu .ics)
function cal_line($line) {
    $out = '';
    $current = '';
    preg_match_all('/./us', $line, $chars);
    foreach ($chars[0] as $char) {
        if (strlen($current) + strlen($char) > 75) {
            $out .= $current . "\r\n";
            $current = ' ';
        }
        $current .= $char;
    }
    return $out . $current . "\r\n";
}

function cal_money($amount) {
    return number_format($amount, 2, ',', '') . ' zł';
}

function cal_day($date) {
    return CAL_WEEKDAYS[(int)$date->format('w')] . ' ' . $date->format('d.m');
}

$month = (int)($_GET['m'] ?? 0);
$year = (int)($_GET['r'] ?? 0);
if ($month < 1 || $month > 12 || $year < 2024 || $year > 2100) cal_fail('Nieprawidłowy miesiąc');
$start = new DateTime(sprintf('%04d-%02d-01', $year, $month));
$monthName = CAL_MONTHS[$month];

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' ? 'https' : 'http';
$host = preg_replace('/[^\w.:-]/', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
$appUrl = $scheme . '://' . $host . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';

$events = [];

$payAt = cal_date($_GET['w'] ?? '', true);
$payDue = cal_date($_GET['wt'] ?? '', false);
$amount = round((float)str_replace(',', '.', (string)($_GET['kwota'] ?? '0')), 2);
if ($payAt && $payDue && cal_near($payAt, $start) && cal_near($payDue, $start) && $amount > 0 && $amount < 10000) {
    $tenth = new DateTime(sprintf('%04d-%02d-10', $year, $month));
    $moved = $payDue->format('d') !== '10'
        ? ' ' . $tenth->format('d.m') . ' wypada w weekend, więc najpóźniej w piątek ' . $payDue->format('d.m') . '.'
        : '';
    $events[] = [
        'uid' => sprintf('obiady-wplata-%04d-%02d', $year, $month),
        'at' => $payAt,
        'summary' => 'Obiady: wpłata ' . cal_money($amount) . ' za ' . $monthName,
        'description' => "Obiady na $monthName $year: " . cal_money($amount) . ", gotówką w sekretariacie szkoły.\n" .
            'Wpłaty są przyjmowane tylko do 10. dnia miesiąca (termin: ' . cal_day($payDue) . ').' . $moved . "\n" . $appUrl,
    ];
}

$declAt = cal_date($_GET['d'] ?? '', true);
$declDue = cal_date($_GET['dt'] ?? '', false);
if ($declAt && $declDue && cal_near($declAt, $start) && cal_near($declDue, $start)) {
    $nextName = CAL_MONTHS[$month === 12 ? 1 : $month + 1];
    $events[] = [
        'uid' => sprintf('obiady-deklaracja-%04d-%02d', $year, $month),
        'at' => $declAt,
        'summary' => 'Obiady: deklaracja na ' . $nextName . ' (termin ' . $declDue->format('d.m') . ')',
        'description' => 'Deklaracje na kolejny miesiąc składa się do ostatniego dnia miesiąca (termin: ' . cal_day($declDue) .
            '), e-mailem na adres ' . CAL_SCHOOL_EMAIL . ".\nJadłospis i gotowa deklaracja: " . $appUrl,
    ];
}

if (!$events) cal_fail('Brak przypomnień do dodania');

$ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Obiady Katolik//Przypomnienia//PL\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n";
foreach ($events as $event) {
    $end = (clone $event['at'])->modify('+15 minutes');
    $ics .= "BEGIN:VEVENT\r\n";
    $ics .= cal_line('UID:' . $event['uid'] . '@' . $host);
    $ics .= 'DTSTAMP:' . gmdate('Ymd\THis\Z') . "\r\n";
    $ics .= 'DTSTART:' . $event['at']->format('Ymd\THis') . "\r\n";
    $ics .= 'DTEND:' . $end->format('Ymd\THis') . "\r\n";
    $ics .= cal_line('SUMMARY:' . cal_escape($event['summary']));
    $ics .= cal_line('DESCRIPTION:' . cal_escape($event['description']));
    $ics .= cal_line('URL:' . $appUrl);
    $ics .= "BEGIN:VALARM\r\nACTION:DISPLAY\r\n" . cal_line('DESCRIPTION:' . cal_escape($event['summary'])) . "TRIGGER:PT0M\r\nEND:VALARM\r\n";
    $ics .= "END:VEVENT\r\n";
}
$ics .= "END:VCALENDAR\r\n";

header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: inline; filename="obiady-przypomnienia.ics"');
echo $ics;
