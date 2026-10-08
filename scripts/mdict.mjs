import { build } from 'esbuild';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { buildFrontendLicenses } from './licenses.mjs';

export const mdictPlugin = {
  name: 'permissive-mdict-lzo',
  setup(build) {
    build.onResolve({ filter: /^(\.\/(lzo1x-wrapper|scanner)\.js|zlib)$/ }, args => {
      if (!args.importer.replaceAll('\\', '/').includes('/js-mdict/')) return;
      return { path: path.resolve(args.path === 'zlib' ? 'src/mdict-zlib.ts' : args.path.includes('scanner') ? 'src/mdict-scanner.ts' : 'src/mdict-lzo.ts') };
    });
  }
};
export async function buildMdict() {
  const result = await build({ entryPoints: ['src/dictionary-worker.ts'], outfile: 'dist/dictionary-worker.cjs', bundle: true,
    platform: 'node', format: 'cjs', target: 'node22', metafile: true, plugins: [mdictPlugin] });
  if (Object.keys(result.metafile.inputs).some(name => /js-mdict.*lzo1x/.test(name))) throw new Error('Unapproved upstream LZO implementation in dictionary worker');
  await buildFrontendLicenses(Object.keys(result.metafile.inputs), 'dictionary');
  const ripemd = await readFile('node_modules/js-mdict/dist/esm/ripemd128.js', 'utf8');
  const notice = ripemd.match(/\/\*[\s\S]*?\*\//)?.[0];
  if (!notice?.includes('MIT')) throw new Error('Missing RIPEMD-128 attribution');
  await writeFile('dist/licenses/dictionary/js-mdict/RIPEMD128-NOTICE.txt', notice + '\n');
}
