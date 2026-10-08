import { parentPort } from 'node:worker_threads';
import { MdictReader } from './mdict-reader';
import { Parser } from 'htmlparser2';

// Only text leaves this worker. Dictionary HTML, scripts and URLs never reach a webview.
export function definitionText(html: string): string {
  if (html.length > 500_000) throw new Error('Entry too large');
  let text = '', hidden = 0;
  const skipped = new Set(['script', 'style', 'head', 'iframe', 'object', 'svg', 'template']);
  const blocks = new Set(['p', 'div', 'br', 'hr', 'li', 'tr', 'h1', 'h2', 'h3', 'section', 'article', 'dd', 'dt']);
  const parser = new Parser({
    onopentag(name) { if (skipped.has(name)) hidden++; if (!hidden && blocks.has(name)) text += '\n'; },
    onclosetag(name) { if (skipped.has(name)) hidden = Math.max(0, hidden - 1); if (!hidden && blocks.has(name)) text += '\n'; },
    ontext(value) { if (!hidden) text += value; }
  }, { decodeEntities: true });
  parser.end(html);
  return text.replace(/\0/g, '').replace(/`\d+`/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

let current: { filename: string; mdx: MdictReader; exact: Map<string, number>; folded: Map<string, number> } | undefined;
function open(filename: string) {
  if (current?.filename === filename) return current;
  current?.mdx.close(); current = undefined;
  const mdx = new MdictReader(filename);
  try {
    if (mdx.meta.version >= 3 || (mdx.meta.encrypt & 1)) throw new Error('Unsupported MDX');
    if (!mdx.keywordList.length || mdx.keywordList.length > 1_000_000) throw new Error('Unsupported entry count');
    const exact = new Map<string, number>(), folded = new Map<string, number>();
    mdx.keywordList.forEach((entry, index) => {
      exact.set(entry.keyText, index);
      const key = entry.keyText.toLowerCase();
      if (!folded.has(key) || entry.keyText === key) folded.set(key, index);
    });
    return current = { filename, mdx, exact, folded };
  } catch (error) { mdx.close(); throw error; }
}
parentPort?.on('message', (request: { id: number; filename: string; word?: string }) => {
  try {
    const dict = open(request.filename);
    if (request.word === undefined) {
      parentPort!.postMessage({ id: request.id, value: { name: definitionText(String(dict.mdx.header.Title || '')).slice(0, 80), entries: dict.mdx.keywordList.length } });
      return;
    }
    let word = request.word;
    const visited = new Set<string>();
    for (let depth = 0; depth < 8 && !visited.has(word); depth++) {
      visited.add(word);
      const index = dict.exact.get(word) ?? dict.folded.get(word.toLowerCase());
      if (index === undefined) break;
      const item = dict.mdx.keywordList[index];
      const raw = dict.mdx.fetch(item).definition?.replace(/\0/g, '').trim();
      if (!raw) break;
      if (raw.startsWith('@@@LINK=')) { word = raw.slice(8).trim(); continue; }
      const translation = definitionText(raw);
      if (translation) { parentPort!.postMessage({ id: request.id, value: { word: item.keyText, translation } }); return; }
      break;
    }
    parentPort!.postMessage({ id: request.id, value: null });
  } catch { parentPort!.postMessage({ id: request.id, error: true }); }
});
