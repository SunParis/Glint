"""Rebuild the vendored ECDICT subset from a pinned upstream CSV (not run by npm)."""
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys

REVISION = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b'
root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(source).hexdigest() != '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf':
    raise ValueError('Expected the pinned ECDICT CSV; review provenance before updating it.')
rows = []
word_pattern = re.compile(r"[A-Za-z]+(?:[-'][A-Za-z]+)*\Z")
def rank(value):
    return int(value) if value and value.isdigit() and int(value) > 0 else 1_000_000

for row in csv.DictReader(io.StringIO(source.decode('utf-8-sig'), newline='')):
    word = row['word']
    if not word_pattern.fullmatch(word) or len(word) > 64 or not row['translation'].strip():
        continue
    if not (row['tag'] or rank(row['bnc']) <= 50000 or rank(row['frq']) <= 50000 or rank(row['collins']) <= 5 or row['oxford'] == '1'):
        continue
    rows.append([word, row['phonetic'].strip(), row['translation'].replace('\\n', '\n').strip(), row['exchange']])
rows.sort(key=lambda row: row[0])
payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
packed = gzip.compress(payload, compresslevel=9, mtime=0)
folder = root / 'third_party' / 'ecdict'
folder.mkdir(parents=True, exist_ok=True)
(folder / 'entries.json.gz').write_bytes(packed)
manifest = dict(source=f'https://github.com/skywind3000/ECDICT/tree/{REVISION}', revision=REVISION,
                sourceSha256=hashlib.sha256(source).hexdigest(), entriesSha256=hashlib.sha256(packed).hexdigest(),
                entries=len(rows), compressedBytes=len(packed), license='MIT',
                selection='Single English words with Chinese meanings; exam tag, BNC/FRQ rank <= 50000, Collins stars or Oxford core flag.')
(folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest, indent=2))
