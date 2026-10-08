import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { CustomDictionary, DictionaryEntry } from './core';
import { dictionaryWord } from './dictionary';

const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
export class CustomDictionaries {
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private serial = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private catalog?: CustomDictionary[];
  private busy = false;
  constructor(private readonly folder: string, private readonly workerFile: string) {}
  list(): CustomDictionary[] {
    if (!this.catalog) {
      const file = path.join(this.folder, 'catalog.json');
      const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
      if (!Array.isArray(saved) || saved.length > 12 || !saved.every(item => item && validId(item.id) && typeof item.name === 'string' && item.name.length <= 80 && typeof item.enabled === 'boolean' && Number.isSafeInteger(item.entries) && item.entries > 0) || new Set(saved.map(item => item.id)).size !== saved.length) throw new Error('自定义词典列表无法读取。');
      this.catalog = saved;
    }
    return structuredClone(this.catalog!);
  }
  private file(id: string) {
    if (!validId(id)) throw new Error('词典无效。');
    return path.join(this.folder, `${id}.mdx`);
  }
  private save(items: CustomDictionary[]) {
    fs.mkdirSync(this.folder, { recursive: true });
    const file = path.join(this.folder, 'catalog.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(items, null, 2));
    fs.renameSync(file + '.tmp', file);
    this.catalog = items;
  }
  private request(filename: string, word?: string): Promise<unknown> {
    clearTimeout(this.timer);
    if (!this.worker) {
      const worker = new Worker(this.workerFile, { resourceLimits: { maxOldGenerationSizeMb: 256 }, stdout: true, stderr: true });
      this.worker = worker;
      worker.stdout?.resume(); worker.stderr?.resume();
      worker.on('message', message => {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id); clearTimeout(pending.timer);
        message.error ? pending.reject(new Error('无法读取该 MDX，文件可能损坏、加密或版本不受支持。')) : pending.resolve(message.value);
        if (!this.pending.size) this.timer = setTimeout(() => { void this.close(); }, 30_000);
      });
      worker.on('error', () => { if (this.worker === worker) void this.close(); });
      worker.on('exit', () => { if (this.worker === worker) void this.close(); });
    }
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { void this.close(); }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, filename, word });
    });
  }
  async importFile(filename: string): Promise<CustomDictionary> {
    if (this.busy) throw new Error('词典正在更新，请稍候。');
    this.busy = true;
    const id = randomUUID(), destination = this.file(id);
    try {
      const items = this.list();
      if (items.length >= 12) throw new Error('最多导入 12 本词典。');
      const stat = await fs.promises.stat(filename);
      if (path.extname(filename).toLowerCase() !== '.mdx' || !stat.isFile() || stat.size < 8 || stat.size > 2 * 1024 ** 3) throw new Error('请选择不超过 2 GB 的 MDX 文件。');
      fs.mkdirSync(this.folder, { recursive: true });
      await fs.promises.copyFile(filename, destination, fs.constants.COPYFILE_EXCL);
      const info = await this.request(destination) as { name: string; entries: number };
      const item = { id, name: info.name || path.basename(filename, path.extname(filename)).slice(0, 80), entries: info.entries, enabled: true };
      this.save([...items, item]); return item;
    } catch (error) {
      await this.close(); await fs.promises.rm(destination, { force: true }); throw error;
    } finally { this.busy = false; }
  }
  async change(id: string, action: 'enable' | 'disable' | 'up' | 'down' | 'remove') {
    if (this.busy) throw new Error('词典正在更新，请稍候。');
    if (!['enable', 'disable', 'up', 'down', 'remove'].includes(action)) throw new Error('词典操作无效。');
    const items = this.list(), index = items.findIndex(item => item.id === id);
    if (index < 0) throw new Error('词典不存在。');
    this.busy = true;
    try {
      if (action === 'remove') {
        await this.close();
        items.splice(index, 1); this.save(items);
        await fs.promises.rm(this.file(id), { force: true });
      } else {
        if (action === 'enable' || action === 'disable') items[index].enabled = action === 'enable';
        else { const next = index + (action === 'up' ? -1 : 1); if (next >= 0 && next < items.length) [items[index], items[next]] = [items[next], items[index]]; }
        this.save(items);
      }
    } finally { this.busy = false; }
  }
  async lookup(text: string): Promise<DictionaryEntry | undefined> {
    const word = dictionaryWord(text);
    if (!word) return;
    for (const item of this.list().filter(item => item.enabled)) {
      try {
        const entry = await this.request(this.file(item.id), word) as { word: string; translation: string } | null;
        if (entry) return { ...entry, phonetic: '', forms: '', source: item.name };
      } catch { /* A broken custom dictionary must not prevent built-in or model lookup. */ }
    }
  }
  async close() {
    clearTimeout(this.timer);
    const worker = this.worker; this.worker = undefined;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('词典读取超时或已关闭，请重试。')); }
    this.pending.clear();
    if (worker) await worker.terminate();
  }
}
