import { DatabaseSync } from 'node:sqlite';
import type { Action, DictionaryEntry } from './core';

export function dictionaryWord(text: string): string | undefined {
  if (text.length > 100) return;
  const word = text.trim().replace(/[‘’]/g, "'").replace(/^["'“”([{]+|["'“”.,!?;:)\]}]+$/g, '');
  return word.length <= 64 && /^[a-z]+(?:[-'][a-z]+)*$/i.test(word) ? word : undefined;
}

// Only the built-in translation action opts in; names and custom prompts are not classifiers.
export function usesDictionary(action: Action, enabled: boolean): boolean {
  return enabled && action.id === 'translate' && action.englishName === 'translation' && action.kind === 'ai';
}

const formNames: Record<string, string> = { p: '过去式', d: '过去分词', i: '现在分词', '3': '第三人称单数', r: '比较级', t: '最高级', s: '复数', '0': '原形' };
function formatForms(exchange: string): string {
  return exchange.split('/').flatMap(part => {
    const [kind, value] = part.split(':');
    return formNames[kind] && value ? [`${formNames[kind]} ${value}`] : [];
  }).join(' · ');
}
export function dictionaryText(entry: DictionaryEntry): string {
  return [entry.word + (entry.phonetic ? ` /${entry.phonetic}/` : ''), entry.translation,
    entry.forms, `来源：${entry.source} · 离线词典`].filter(Boolean).join('\n\n');
}

export class OfflineDictionary {
  private db?: DatabaseSync;
  constructor(private readonly filename: string) {}
  lookup(text: string): DictionaryEntry | undefined {
    const word = dictionaryWord(text);
    if (!word) return;
    if (!this.db) {
      const db = new DatabaseSync(this.filename, { readOnly: true });
      try {
        if (db.prepare('PRAGMA user_version').get()?.user_version !== 1) throw new Error('Unsupported dictionary schema');
        db.exec('PRAGMA query_only=ON; PRAGMA cache_size=-512;');
        this.db = db;
      } catch (error) { db.close(); throw error; }
    }
    // Prefer exact case (US/us), then case-insensitive entries, then attested inflections.
    let row = this.db.prepare('SELECT * FROM entries WHERE word=?').get(word);
    row ??= this.db.prepare('SELECT * FROM entries WHERE normalized=? ORDER BY word=normalized DESC, word LIMIT 1').get(word.toLowerCase());
    if (!row) {
      const candidates = this.db.prepare('SELECT e.* FROM forms f JOIN entries e ON e.word=f.word WHERE f.form=? ORDER BY e.word LIMIT 2').all(word.toLowerCase());
      // Ambiguous inflections go to AI instead of arbitrarily choosing a lemma.
      if (candidates.length === 1) row = candidates[0];
    }
    if (!row) return;
    return { word: String(row.word), phonetic: String(row.phonetic), translation: String(row.translation), forms: formatForms(String(row.exchange)), source: 'ECDICT' };
  }
  close() { this.db?.close(); this.db = undefined; }
}
