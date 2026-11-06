"""Dopisuje do styles.css i script.js w index.html wersję (?v=) liczoną z treści pliku.

Hosting zapamiętuje te pliki w przeglądarkach na długo, więc bez tego po
aktualizacji strony rodzice dostają nowy index.html ze starym skryptem i stylami.
Uruchom przed wysłaniem plików na serwer: python tools/asset_versions.py
"""
import hashlib
import pathlib
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')  # konsola Windows nie zna polskich znaków

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'

html = INDEX.read_bytes().decode('utf-8')
for name in ('styles.css', 'script.js'):
    version = hashlib.sha1((ROOT / name).read_bytes()).hexdigest()[:10]
    html, count = re.subn(r'(["\'])' + re.escape(name) + r'(\?v=[0-9a-f]*)?\1', r'\g<1>' + name + '?v=' + version + r'\g<1>', html)
    print(f'{name}: v={version} ({count} odwołanie)')
INDEX.write_bytes(html.encode('utf-8'))
