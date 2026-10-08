import { app } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { ApplicationRuntime } from './main';

// Small packaged startup probe. Full test scenarios are never shipped.
export async function runPackageCheck(runtime: ApplicationRuntime) {
  assert.equal(app.isPackaged, true, 'Must test a packaged executable');
  assert.ok(runtime.dictionary.lookup('apple')?.translation, 'Packaged offline dictionary must be readable outside ASAR');
  const fixture = path.join(runtime.testRoot, 'work', 'fixture.mdx');
  if (fs.existsSync(fixture)) {
    const imported = await runtime.customDictionaries.importFile(fixture);
    assert.ok((await runtime.customDictionaries.lookup('apple'))?.translation, 'Packaged MDX worker can import and query');
    await runtime.customDictionaries.change(imported.id, 'remove');
  }
  const deadline = Date.now() + 15000;
  while (runtime.status.hook === 'starting' || !runtime.setup || runtime.setup.webContents.isLoading()) {
    if (Date.now() > deadline) throw new Error('Packaged startup timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(runtime.status.hook, 'ready', runtime.status.message);
  assert.equal(app.commandLine.hasSwitch('no-sandbox'), false, 'Packaged startup must retain the Chromium sandbox');
  assert.deepEqual(await runtime.setup.webContents.executeJavaScript('({ process: typeof process, require: typeof require })'),
    { process: 'undefined', require: 'undefined' }, 'The renderer must not expose Node globals');
  assert.equal(await runtime.setup.webContents.executeJavaScript("typeof window.glint.save"), 'function');
  const bridgeResult = await runtime.setup.webContents.executeJavaScript("window.glint.snapshot().then(() => 'ok').catch(error => String(error))");
  assert.equal(bridgeResult, 'ok', `Packaged IPC bridge failed (${runtime.setup.webContents.getURL()}): ${bridgeResult}`);
  // did-finish-load precedes the renderer's asynchronous IPC snapshot/render.
  // Wait for the actual controls, particularly on a cold portable extraction.
  while (!await runtime.setup.webContents.executeJavaScript("!!document.querySelector('[data-page=actions]')")) {
    if (Date.now() > deadline) throw new Error('Packaged settings controls did not render');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await runtime.setup.webContents.executeJavaScript("document.querySelector('.version-label')?.textContent"),
    app.getVersion(), 'Displayed version must match the packaged application');
  for (const action of runtime.settings.actions.filter(action => action.kind === 'ai')) assert.ok(fs.existsSync(runtime.recordPath(action.englishName)), 'Packaged SQLite initialization');
  assert.ok(!runtime.paths.data.startsWith(runtime.root), 'Packaged test data must be outside ASAR');

}
