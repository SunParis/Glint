import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// No network during normal builds. The reviewed, compressed source is vendored.
export function buildDictionary() {
  const folder = 'third_party/ecdict';
  const manifest = JSON.parse(readFileSync(`${folder}/manifest.json`, 'utf8'));
  const packed = readFileSync(`${folder}/entries.json.gz`);
  if (createHash('sha256').update(packed).digest('hex') !== manifest.entriesSha256) throw new Error('Dictionary source checksum mismatch');
  const entries = JSON.parse(gunzipSync(packed).toString('utf8'));
  if (entries.length !== manifest.entries) throw new Error('Dictionary source count mismatch');
  mkdirSync('dist/dictionary', { recursive: true });
  const temp = 'dist/dictionary/ecdict.sqlite.tmp';
  rmSync(temp, { force: true });
  const db = new DatabaseSync(temp);
  try {
    db.exec(`PRAGMA journal_mode=OFF; BEGIN;
      CREATE TABLE entries (word TEXT PRIMARY KEY, normalized TEXT NOT NULL, phonetic TEXT NOT NULL, translation TEXT NOT NULL, exchange TEXT NOT NULL) STRICT;
      CREATE INDEX entries_normalized ON entries(normalized);
      CREATE TABLE forms (form TEXT NOT NULL, word TEXT NOT NULL, PRIMARY KEY(form, word)) WITHOUT ROWID;
      PRAGMA user_version=1;`);
    const insert = db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?)');
    const form = db.prepare('INSERT OR IGNORE INTO forms VALUES (?, ?)');
    for (const [word, phonetic, translation, exchange] of entries) {
      insert.run(word, word.toLowerCase(), phonetic, translation, exchange);
      for (const part of exchange.split('/')) {
        const [kind, values] = part.split(':');
        if (!['p', 'd', 'i', '3', 'r', 't', 's'].includes(kind)) continue;
        for (const value of (values || '').split(',')) {
          if (/^[a-z]+(?:[-'][a-z]+)*$/i.test(value)) form.run(value.toLowerCase(), word);
        }
      }
    }
    db.exec('COMMIT; VACUUM;');
  } finally { db.close(); }
  renameSync(temp, 'dist/dictionary/ecdict.sqlite');
  copyFileSync(`${folder}/LICENSE`, 'dist/dictionary/LICENSE');
  copyFileSync(`${folder}/manifest.json`, 'dist/dictionary/manifest.json');
}
