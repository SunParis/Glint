import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dictionaryWord, dictionaryText, OfflineDictionary, usesDictionary } from '../src/dictionary';
import { defaults, migrateSettings, validateSettings } from '../src/core';

test('single-word detection trims punctuation but rejects phrases, URLs, code and non-English input', () => {
  for (const [input, word] of [[' “Apple,” ', 'Apple'], ['running.', 'running'], ['well-known', 'well-known'], ['can’t', "can't"]]) assert.equal(dictionaryWord(input), word);
  for (const input of ['', 'hello world', '你好', 'foo_bar', '42', 'www.example.com', 'a/b', 'hello\nworld', 'x'.repeat(65), "x' OR 1=1"]) assert.equal(dictionaryWord(input), undefined);
});

test('only built-in translation opts in and old settings migrate without changing explicit opt-out', () => {
  assert.equal(usesDictionary(defaults.actions[0], true), true);
  assert.equal(usesDictionary({ ...defaults.actions[0], name: '自定义显示名' }, true), true);
  for (const action of [...defaults.actions.slice(1), { ...defaults.actions[0], id: 'custom' }, { ...defaults.actions[0], kind: 'search' as const }]) assert.equal(usesDictionary(action, true), false);
  assert.equal(usesDictionary(defaults.actions[0], false), false);
  const { dictionaryEnabled: _old, ...legacy } = defaults;
  assert.equal(migrateSettings(legacy).dictionaryEnabled, true);
  assert.equal(validateSettings({ ...defaults, dictionaryEnabled: false }).dictionaryEnabled, false);
  assert.throws(() => validateSettings({ ...defaults, dictionaryEnabled: 'yes' }));
});

test('read-only lookup prefers exact case, supports attested forms and rejects ambiguous or unknown words', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'glint-dictionary-'));
  const filename = path.join(folder, 'fixture.sqlite');
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE entries(word TEXT PRIMARY KEY, normalized TEXT, phonetic TEXT, translation TEXT, exchange TEXT);
    CREATE TABLE forms(form TEXT, word TEXT); PRAGMA user_version=1;`);
  const insert = db.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?)');
  for (const row of [['apple', 'apple', 'test', 'n. 苹果', 's:apples'], ['run', 'run', '', 'v. 跑', 'i:running'], ['US', 'us', '', '美国', ''], ['us', 'us', '', '我们', '']]) insert.run(...row);
  db.exec("INSERT INTO forms VALUES ('running','run'), ('ambiguous','run'), ('ambiguous','apple')"); db.close();
  const dictionary = new OfflineDictionary(filename);
  try {
    assert.match(dictionary.lookup('“APPLE!”')!.translation, /苹果/);
    assert.equal(dictionary.lookup('US')?.translation, '美国');
    assert.equal(dictionary.lookup('us')?.translation, '我们');
    assert.equal(dictionary.lookup('running')?.word, 'run');
    assert.equal(dictionary.lookup('ambiguous'), undefined);
    assert.equal(dictionary.lookup('unknown'), undefined);
    assert.equal(dictionary.lookup('an apple'), undefined);
    assert.match(dictionaryText(dictionary.lookup('apple')!), /复数 apples/);
    assert.match(dictionaryText(dictionary.lookup('apple')!), /ECDICT/);
  } finally { dictionary.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('missing dictionary never creates a database, and non-word input does not open one', () => {
  const dictionary = new OfflineDictionary(path.join(tmpdir(), 'glint-nonexistent-dictionary-dir', 'missing.sqlite'));
  assert.equal(dictionary.lookup('a phrase'), undefined);
  assert.throws(() => dictionary.lookup('apple'));
});
