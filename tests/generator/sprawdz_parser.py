# Ocena parsera na wygenerowanych jadłospisach (najpierw: python generuj_jadlospisy.py 200).
# Użycie: python sprawdz_parser.py [formaty, np. docx,txt] [--services | --ocr] [--only 003,005] [--verbose]
# PHP: z PATH albo ze zmiennej środowiskowej PHP. --services i --ocr używają kluczy z konfiguracji aplikacji.
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
PHP = os.environ.get('PHP', 'php')
RUN = os.path.join(HERE, 'parse_file.php')
RUN_SERVICES = os.path.join(HERE, 'parse_file.php')
RUN_OCR = os.path.join(HERE, 'parse_file.php')
CASES = os.path.join(HERE, 'cases')


def words(text):
    text = unicodedata.normalize('NFD', (text or '').lower().replace('ł', 'l'))
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return [w for w in re.findall(r'[a-z0-9]+', text)]


def dish_ok(truth, parsed):
    tw, pw = set(words(truth)), set(words(parsed))
    if not tw:
        return True
    recall = len(tw & pw) / len(tw)
    extra = len(pw - tw - {'zupa'})
    return recall >= 0.85 and extra <= max(2, len(tw) // 4)


def parse(path, services):
    mode = 'ocr' if services == 'ocr' else ('services' if services else 'local')
    out = subprocess.run([PHP, RUN, path, mode], capture_output=True)
    try:
        return json.loads(out.stdout.decode('utf-8'))
    except Exception:
        return {'type': '?', 'result': None, 'php': out.stdout.decode('utf-8', 'replace')[:500] + out.stderr.decode('utf-8', 'replace')[:500]}


def evaluate(case_dir, fmt, services, verbose):
    truth = json.load(open(os.path.join(case_dir, 'truth.json'), encoding='utf-8'))
    path = os.path.join(case_dir, 'menu.' + fmt)
    if not os.path.exists(path):
        return None
    data = parse(path, services)
    result = data.get('result') or {}
    parsed = {d['date']: d for d in result.get('Days', [])}
    expected = {d['date']: d for d in truth['days']}
    found = [k for k in expected if k in parsed]
    extra = [k for k in parsed if k not in expected]
    dishes_ok = sum(1 for k in found if dish_ok(expected[k]['soup'], parsed[k]['zupa']) and dish_ok(expected[k]['main'], parsed[k]['drugieDanie']))
    perfect = len(found) == len(expected) and not extra and dishes_ok == len(expected)
    row = {'case': os.path.basename(case_dir), 'fmt': fmt, 'layout': truth['layout'], 'expected': len(expected),
           'found': len(found), 'extra': extra, 'dishes_ok': dishes_ok, 'perfect': perfect,
           'year_ok': result.get('Year') == truth['year'], 'source': result.get('Source'), 'log': data.get('log')}
    if verbose and not perfect:
        print(f"--- {row['case']} [{fmt}] znalezione {len(found)}/{len(expected)} dania {dishes_ok} nadmiar {extra} rok {result.get('Year')}")
        print('    bledy w pliku:', '; '.join(truth['errors'][:12]))
        for k, e in expected.items():
            p = parsed.get(k)
            if not p:
                print(f'    BRAK {k}')
            elif not (dish_ok(e['soup'], p['zupa']) and dish_ok(e['main'], p['drugieDanie'])):
                print(f"    {k} zupa: {p['zupa'][:45]!r} (ma byc {e['soup'][:30]!r}) | drugie: {p['drugieDanie'][:45]!r}")
        if data.get('php'):
            print('    PHP:', data['php'][:300])
    return row


def main():
    formats = (sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'docx,txt').split(',')
    services = 'ocr' if '--ocr' in sys.argv else ('--services' in sys.argv)
    verbose = '--verbose' in sys.argv
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    rows = []
    for name in sorted(os.listdir(CASES)):
        if only and name[:3] not in only:
            continue
        for fmt in formats:
            row = evaluate(os.path.join(CASES, name), fmt, services, verbose)
            if row:
                rows.append(row)
    by = defaultdict(lambda: [0, 0, 0, 0, 0])
    for r in rows:
        key = (r['layout'], r['fmt'])
        by[key][0] += 1
        by[key][1] += r['perfect']
        by[key][2] += r['found']
        by[key][3] += r['expected']
        by[key][4] += r['dishes_ok']
    print(f"\n{'układ':16} {'format':6} {'pliki bez błędu':>16} {'dni znalezione':>15} {'dania poprawne':>15}")
    for (layout, fmt), (n, perfect, found, expected, dishes) in sorted(by.items()):
        print(f'{layout:16} {fmt:6} {perfect:>9}/{n:<6} {found:>8}/{expected:<6} {dishes:>8}/{expected:<6}')
    total = len(rows)
    print(f"\nRAZEM: {sum(r['perfect'] for r in rows)}/{total} plików bez żadnego błędu, "
          f"dni {sum(r['found'] for r in rows)}/{sum(r['expected'] for r in rows)}, "
          f"dania {sum(r['dishes_ok'] for r in rows)}/{sum(r['expected'] for r in rows)}, "
          f"nadmiarowe dni {sum(len(r['extra']) for r in rows)}, zły rok {sum(not r['year_ok'] for r in rows)}")
    json.dump(rows, open(os.path.join(HERE, 'last_results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
