import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// Generate original test data outside the distributable. No fixtures enter the app.
let fixture;
export async function writeDictionaryFixture(profile) {
  if (!fixture) {
    await build({ entryPoints: ['tests/fixtures/mdx.ts'], outfile: 'work/mdx-fixture.cjs', bundle: true, platform: 'node', format: 'cjs' });
    fixture = createRequire(import.meta.url)(path.resolve('work/mdx-fixture.cjs')).mdxFixture();
  }
  mkdirSync(path.join(profile, 'work'), { recursive: true });
  writeFileSync(path.join(profile, 'work', 'fixture.mdx'), fixture);
}
