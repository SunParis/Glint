import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CustomDictionaries } from '../src/custom-dictionaries';
import { mdxFixture } from './fixtures/mdx';
import { definitionText } from '../src/dictionary-worker';

test('MDX import, zlib/LZO, cross-block records, links, ordering and restart persistence', async () => {
  const folder = fs.mkdtempSync(path.resolve('work/mdx-test-'));
  const catalog = path.join(folder, 'library');
  const worker = path.resolve('dist/dictionary-worker.cjs');
  const library = new CustomDictionaries(catalog, worker);
  try {
    const a = path.join(folder, 'a.mdx'), b = path.join(folder, 'b.mdx');
    fs.writeFileSync(a, mdxFixture('词典 A')); fs.writeFileSync(b, mdxFixture('词典 B', true, 1.2));
    const first = await library.importFile(a), second = await library.importFile(b);
    assert.equal(first.entries, 4);
    assert.equal((await library.lookup('“Apple,”'))?.source, '词典 A');
    assert.equal((await library.lookup('apple'))?.translation, '自定义苹果 & 例句\n\n第二行');
    assert.equal((await library.lookup('apples'))?.word, 'apple');
    assert.equal(await library.lookup('cycle'), undefined);
    assert.equal(await library.lookup('a phrase'), undefined);
    assert.equal((await library.lookup('zebra'))?.translation, '最后的斑马。');
    await library.change(second.id, 'up');
    assert.equal((await library.lookup('apple'))?.source, '词典 B');
    await library.change(second.id, 'disable');
    assert.equal((await library.lookup('apple'))?.source, '词典 A');
    await library.close();
    const restored = new CustomDictionaries(catalog, worker);
    assert.deepEqual(restored.list(), library.list());
    await restored.close();
    const invalid = path.join(folder, 'broken.mdx'); fs.writeFileSync(invalid, Buffer.alloc(10));
    await assert.rejects(library.importFile(invalid));
    assert.equal(library.list().length, 2, 'failed imports preserve the catalog');
    assert.equal(fs.readdirSync(catalog).filter(file => file.endsWith('.mdx')).length, 2, 'failed imports leave no copied dictionary');
    await assert.rejects(library.change('../escape', 'remove'));
    await library.change(first.id, 'remove');
    assert.equal(fs.existsSync(a), true, 'removal keeps the original download');
    assert.equal(fs.existsSync(path.join(catalog, first.id + '.mdx')), false);
  } finally { await library.close(); fs.rmSync(folder, { recursive: true, force: true }); }
});
test('dictionary markup is converted to inert readable text', () => {
  assert.equal(definitionText('<div>Hello &lt;world&gt;</div><script>alert(1)</script><style>evil</style><img src="https://example.com/x" onerror="evil()"><p>Next</p>'), 'Hello <world>\n\nNext');
  assert.throws(() => definitionText('x'.repeat(500_001)));
});
