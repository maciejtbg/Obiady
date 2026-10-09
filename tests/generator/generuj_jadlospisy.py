# Generator losowych jadłospisów do testów parsera (wymaga: pip install python-docx).
# Każdy jadłospis: 2 tygodnie dni szkolnych w losowym miesiącu, losowy układ,
# losowe błędy w nazwach dni i datach. Zapisuje menu.docx, menu.txt i truth.json.
import datetime as dt
import json
import os
import random
import sys
import unicodedata

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.shared import Pt, Cm

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cases')

SOUPS = ['Pomidorowa z ryżem – 250 ml', 'Rosół z makaronem', 'Krupnik z kaszą jęczmienną', 'Ogórkowa z ziemniakami – 250 ml',
         'Barszcz czerwony z jajkiem', 'Żurek z kiełbasą', 'Kapuśniak z młodej kapusty', 'Grochówka', 'Krem z dyni z grzankami',
         'Kalafiorowa', 'Jarzynowa zabielana – 250 ml', 'Pieczarkowa z makaronem', 'Fasolowa', 'Koperkowa z ziemniakami',
         'Brokułowa', 'Zupa szczawiowa z jajkiem', 'Zupa porowa z ziemniakami']
MAINS = ['Kotlet schabowy, ziemniaki, surówka z kapusty', 'Spaghetti bolognese z serem', 'Pierogi ruskie ze śmietaną',
         'Filet z miruny – 100 g, puree, marchewka z groszkiem', 'Naleśniki z serem i sosem truskawkowym',
         'Gulasz wołowy z kaszą gryczaną', 'Kurczak w sosie curry, ryż – 120 g', 'Placki ziemniaczane z jogurtem',
         'Makaron z serem i szpinakiem', 'Pulpety w sosie koperkowym, ziemniaki', 'Ryba po grecku, ryż',
         'Kotlet mielony, ziemniaki, buraczki', 'Leniwe pierogi z masłem', 'Risotto z warzywami',
         'Udko pieczone, frytki, surówka z marchewki', 'Gołąbki w sosie pomidorowym', 'Racuchy z jabłkiem']
DESSERTS = ['jabłko', 'banan', 'kisiel', 'budyń waniliowy', 'galaretka', 'mus owocowy', '']

WEEKDAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek']
ABBR = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt']
MONTHS_NOM = ['', 'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień']
MONTHS_GEN = ['', 'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
HOLIDAYS = {dt.date(2026, 11, 11): 'Święto Niepodległości', dt.date(2027, 1, 1): 'Nowy Rok',
            dt.date(2027, 1, 6): 'Trzech Króli', dt.date(2026, 10, 14): 'Dzień Edukacji Narodowej'}
LAYOUTS = ['tabela', 'tabela_kolumny', 'punkty', 'pauzy', 'numeracja', 'akapity', 'jedna_linia', 'bez_dat']


def strip_diacritics(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn').replace('ł', 'l').replace('Ł', 'L')


def weekday_text(i, rng, errors):
    """Nazwa dnia z losowym błędem; errors zbiera opis wprowadzonych błędów."""
    name = WEEKDAYS[i]
    kind = rng.choice(['ok', 'ok', 'upper', 'lower', 'split', 'split', 'typo', 'nodiac', 'abbr'])
    if kind == 'split':
        cuts = sorted(rng.sample(range(2, len(name) - 1), k=min(2, len(name) - 3)))
        parts, last = [], 0
        for c in cuts[:rng.choice([1, 2])]:
            parts.append(name[last:c])
            last = c
        parts.append(name[last:])
        name = ' '.join(parts)
    elif kind == 'typo':
        letters = list(name)
        pos = rng.randrange(2, len(letters) - 1)
        op = rng.choice(['delete', 'swap', 'replace'])
        if op == 'delete':
            del letters[pos]
        elif op == 'swap':
            letters[pos], letters[pos - 1] = letters[pos - 1], letters[pos]
        else:
            letters[pos] = rng.choice('aeiouyrkt')
        name = ''.join(letters)
    elif kind == 'nodiac':
        name = strip_diacritics(name)
    elif kind == 'abbr':
        name = ABBR[i] + rng.choice(['', '.'])
    if kind != 'ok':
        errors.append(f'dzień:{kind}:{name}')
    if rng.random() < 0.4:
        name = name.upper()
    return name


def date_text(day, rng, errors, with_weekday):
    kinds = ['dd.mm', 'd.mm', 'dd.mm.yyyy', 'd/m', 'dd-mm', 'slownie', 'rzymski', 'dd.mm.', 'spacja', 'go', 'dd.mm.yy', 'O_zamiast_0', 'skrot_mies']
    if with_weekday:
        kinds.append('przecinek')
    kind = rng.choice(kinds)
    d, m, y = day.day, day.month, day.year
    text = {
        'dd.mm': f'{d:02d}.{m:02d}', 'd.mm': f'{d}.{m:02d}', 'dd.mm.yyyy': f'{d:02d}.{m:02d}.{y}',
        'd/m': f'{d}/{m}', 'dd-mm': f'{d:02d}-{m:02d}', 'slownie': f'{d} {MONTHS_GEN[m]}',
        'rzymski': f'{d}.{ROMAN[m]}', 'dd.mm.': f'{d:02d}.{m:02d}.', 'spacja': f'{d:02d} .{m:02d}',
        'go': f'{d}-go {MONTHS_GEN[m]}', 'dd.mm.yy': f'{d:02d}.{m:02d}.{y % 100:02d}',
        'O_zamiast_0': f'{d:02d}.{m:02d}'.replace('0', 'O', 1) if '0' in f'{d:02d}.{m:02d}' else f'{d:02d}.{m:02d}',
        'skrot_mies': f'{d} {MONTHS_GEN[m][:3]}', 'przecinek': f'{d},{m:02d}',
    }[kind]
    if kind not in ('dd.mm', 'd.mm', 'dd.mm.yyyy'):
        errors.append(f'data:{kind}:{text}')
    return text


def day_header(i, day, rng, errors, with_date=True, in_table=False):
    wd = weekday_text(i, rng, errors)
    if not with_date:
        return wd
    date = date_text(day, rng, errors, True)
    # Tabulator między dniem a datą tylko w układach liniowych (w tabeli rozbiłby komórkę)
    sep = rng.choice([' ', ' ', ', ', ' – ', ' (', ''] + ([] if in_table else ['\t']))
    if sep == '':
        errors.append('brak_spacji')
    if rng.random() < 0.15:
        return f'{date} {wd}'
    return f'{wd}{sep}{date})' if sep == ' (' else f'{wd}{sep}{date}'


def make_case(seed):
    rng = random.Random(seed)
    year, month = rng.choice([(2026, 10), (2026, 11), (2026, 12), (2027, 1), (2027, 2)])
    layout = LAYOUTS[seed % len(LAYOUTS)]
    first = dt.date(year, month, 1)
    mondays = [first + dt.timedelta(days=k) for k in range(28) if (first + dt.timedelta(days=k)).weekday() == 0]
    # Jadłospis bez dat bez zakresu w nagłówku tygodnia musi zaczynać się od pierwszego tygodnia
    start = mondays[0] if layout == 'bez_dat' and seed % 3 == 0 else rng.choice(mondays[:3])
    days = [start + dt.timedelta(days=w * 7 + k) for w in range(2) for k in range(5)]
    days = [d for d in days if d.month == month]
    menu, truth = [], []
    for d in days:
        if d in HOLIDAYS:
            menu.append({'date': d, 'holiday': HOLIDAYS[d]})
            continue
        soup, main = rng.choice(SOUPS), rng.choice(MAINS)
        dessert = rng.choice(DESSERTS)
        menu.append({'date': d, 'soup': soup, 'main': main, 'dessert': dessert, 'allergens': ','.join(sorted(rng.sample(['1', '3', '4', '7', '9'], 2)))})
        truth.append({'date': d.strftime('%d.%m'), 'soup': soup, 'main': main})
    show_year = rng.random() < 0.7
    title = rng.choice(['Jadłospis', 'JADŁOSPIS SZKOLNY', 'Menu stołówki', 'Jadłospis obiadów']) + ' – ' + \
        (MONTHS_NOM[month].upper() if rng.random() < 0.5 else MONTHS_NOM[month]) + (f' {year}' if show_year or layout == 'bez_dat' else '')
    errors = []
    return rng, layout, title, menu, truth, errors, year, month


# ---------- układy: każdy zwraca listę bloków ('p', tekst, styl) / ('table', wiersze)

def build_blocks(rng, layout, title, menu, errors):
    blocks = [('p', title, None)]
    soup_label = rng.choice(['Zupa', 'ZUPA', 'I danie', 'Pierwsze danie', 'zupa'])
    main_label = rng.choice(['II danie', 'Drugie danie', 'DRUGIE DANIE', 'Danie główne', 'Obiad'])
    sep = rng.choice([': ', ' – ', ' - ', ':'])
    weeks = []
    for item in menu:
        if not weeks or item['date'].weekday() == 0:
            weeks.append([])
        weeks[-1].append(item)

    if layout == 'tabela':
        header = [rng.choice(['DZIEŃ', 'Data', 'Dzień tygodnia']), soup_label.upper() if rng.random() < .5 else soup_label,
                  main_label, rng.choice(['DESER', 'Deser', 'Podwieczorek']), rng.choice(['ALERGENY', 'Alergeny', 'Alergny'])]
        order = [0, 1, 2, 3, 4]
        if rng.random() < 0.4:
            order = [0, 2, 1, 4, 3]
            errors.append('kolumny:zamienione')
        for n, week in enumerate(weeks, 1):
            blocks.append(('p', f'Tydzień {n}', None))
            rows = [[header[k] for k in order]]
            for item in week:
                i = item['date'].weekday()
                head = day_header(i, item['date'], rng, errors, in_table=True)
                cells = [head, 'DZIEŃ WOLNY – ' + item['holiday'], '', '', ''] if 'holiday' in item else \
                    [head, item['soup'], item['main'], item['dessert'], item['allergens']]
                rows.append([cells[k] for k in order] if 'holiday' not in item else cells)
            blocks.append(('table', rows))
    elif layout == 'tabela_kolumny':
        for n, week in enumerate(weeks, 1):
            rows = [[''] + [day_header(it['date'].weekday(), it['date'], rng, errors, in_table=True) for it in week]]
            rows.append([soup_label] + [it.get('soup', 'DZIEŃ WOLNY') for it in week])
            rows.append([main_label] + [it.get('main', '') for it in week])
            rows.append(['Deser'] + [it.get('dessert', '') for it in week])
            blocks.append(('table', rows))
    elif layout in ('punkty', 'pauzy', 'numeracja'):
        bullet = {'punkty': '• ', 'pauzy': rng.choice(['– ', '- ', '— ']), 'numeracja': None}[layout]
        number = 1
        for item in menu:
            head = day_header(item['date'].weekday(), item['date'], rng, errors)
            prefix = f'{number}. ' if layout == 'numeracja' else bullet
            number += 1
            blocks.append(('p', prefix + head, None))
            sub = '    ' + (bullet or '– ')
            if 'holiday' in item:
                blocks.append(('p', sub + 'Dzień wolny – ' + item['holiday'], None))
                continue
            blocks.append(('p', sub + soup_label + sep + item['soup'], None))
            blocks.append(('p', sub + main_label + sep + item['main'], None))
            if item['dessert']:
                blocks.append(('p', sub + 'Deser' + sep + item['dessert'], None))
    elif layout == 'akapity':
        for item in menu:
            blocks.append(('p', day_header(item['date'].weekday(), item['date'], rng, errors).upper(), None))
            if 'holiday' in item:
                blocks.append(('p', 'Nieczynne – ' + item['holiday'], None))
                continue
            blocks.append(('p', item['soup'] if 'Zupa' in item['soup'] else 'Zupa ' + item['soup'].lower(), None))
            blocks.append(('p', item['main'], None))
    elif layout == 'jedna_linia':
        joiner = rng.choice([' / ', '; ', ' | '])
        for item in menu:
            head = day_header(item['date'].weekday(), item['date'], rng, errors)
            if 'holiday' in item:
                blocks.append(('p', f'{head} – dzień wolny ({item["holiday"]})', None))
            elif rng.random() < 0.5:
                blocks.append(('p', f'{head}: {soup_label}{sep}{item["soup"]}{joiner}{main_label}{sep}{item["main"]}', None))
            else:
                blocks.append(('p', f'{head} – {item["soup"]}{joiner}{item["main"]}', None))
    elif layout == 'bez_dat':
        for n, week in enumerate(weeks, 1):
            first_day, last_day = week[0]['date'], week[-1]['date']
            if menu[0]['date'].day > 7 or rng.random() < 0.85:
                header = rng.choice([f'Tydzień {n} ({first_day.day}–{last_day.day} {MONTHS_GEN[first_day.month]})',
                                     f'TYDZIEŃ {n} • {first_day.day}–{last_day.day} {MONTHS_GEN[first_day.month].upper()}',
                                     f'Tydzień {n}: {first_day:%d.%m}–{last_day:%d.%m}'])
            else:
                header = f'Tydzień {n}'
            blocks.append(('p', header, None))
            rows = [['Dzień', 'Zupa', 'Drugie danie']]
            for item in week:
                head = day_header(item['date'].weekday(), item['date'], rng, errors, with_date=False)
                rows.append([head, 'DZIEŃ WOLNY', ''] if 'holiday' in item else [head, item['soup'], item['main']])
            blocks.append(('table', rows))
    blocks.append(('p', 'Alergeny: 1 – gluten, 3 – jaja, 4 – ryby, 7 – mleko, 9 – seler', None))
    blocks.append(('p', 'CENNIK', None))
    blocks.append(('p', 'Zupa – 8,50 zł', None))
    blocks.append(('p', 'II danie – 18,00 zł', None))
    return blocks


def write_docx(blocks, path):
    doc = Document()
    section = doc.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width
    for margin in ('left_margin', 'right_margin', 'top_margin', 'bottom_margin'):
        setattr(section, margin, Cm(1.2))
    doc.styles['Normal'].font.size = Pt(9)
    for block in blocks:
        if block[0] == 'p':
            para = doc.add_paragraph(block[1])
            para.paragraph_format.space_after = Pt(0)
        else:
            rows = block[1]
            table = doc.add_table(rows=len(rows), cols=len(rows[0]))
            table.style = 'Table Grid'
            for r, row in enumerate(rows):
                for c, text in enumerate(row):
                    table.cell(r, c).text = text
    doc.save(path)


def write_txt(blocks, path, rng):
    """Tekst: tabele jako kolumny o stałej szerokości albo z tabulatorami."""
    lines = []
    for block in blocks:
        if block[0] == 'p':
            lines.append(block[1])
            continue
        rows = block[1]
        if rng.random() < 0.5:
            for row in rows:
                lines.append('\t'.join(row))
        else:
            widths = [min(34, max(len(r[c]) for r in rows) + 3) for c in range(len(rows[0]))]
            for row in rows:
                # Zawijamy długie komórki na kolejne linie, jak w PDF
                wrapped = [wrap(cell, widths[c] - 3) for c, cell in enumerate(row)]
                for k in range(max(len(w) for w in wrapped)):
                    lines.append(''.join((w[k] if k < len(w) else '').ljust(widths[c]) for c, w in enumerate(wrapped)).rstrip())
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def wrap(text, width):
    words, out, line = text.split(), [], ''
    for word in words:
        if line and len(line) + 1 + len(word) > width:
            out.append(line)
            line = word
        else:
            line = (line + ' ' + word).strip()
    out.append(line)
    return out or ['']


def main(count):
    os.makedirs(OUT, exist_ok=True)
    summary = []
    for seed in range(count):
        rng, layout, title, menu, truth, errors, year, month = make_case(seed)
        blocks = build_blocks(rng, layout, title, menu, errors)
        folder = os.path.join(OUT, f'{seed:03d}_{layout}')
        os.makedirs(folder, exist_ok=True)
        write_docx(blocks, os.path.join(folder, 'menu.docx'))
        write_txt(blocks, os.path.join(folder, 'menu.txt'), rng)
        with open(os.path.join(folder, 'truth.json'), 'w', encoding='utf-8') as f:
            json.dump({'layout': layout, 'year': year, 'month': month, 'days': truth, 'errors': errors}, f, ensure_ascii=False, indent=1)
        summary.append((folder, layout, len(truth), len(errors)))
    print(f'wygenerowano {len(summary)} jadłospisów w {OUT}')


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 40)
