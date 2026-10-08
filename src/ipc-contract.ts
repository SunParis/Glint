import type { GlintAPI } from './core';

// The channel names are internal; the preload exposes only the named GlintAPI methods.
export interface IPCContract {
  snapshot: GlintAPI['snapshot'];
  save: GlintAPI['save'];
  demo: GlintAPI['demo'];
  'fit-toolbar': GlintAPI['fitToolbar'];
  'reveal-toolbar': GlintAPI['revealToolbar'];
  run: GlintAPI['run'];
  settings: GlintAPI['openSettings'];
  'settings-window': GlintAPI['settingsWindow'];
  dismiss: GlintAPI['dismiss'];
  cancel: GlintAPI['cancel'];
  'retry-result': GlintAPI['retryResult'];
  'copy-result': GlintAPI['copyResult'];
  'record-source': GlintAPI['recordSource'];
  'list-records': GlintAPI['listRecords'];
  'get-record': GlintAPI['getRecord'];
  'copy-record': GlintAPI['copyRecord'];
  'delete-record': GlintAPI['deleteRecord'];
  'list-dictionaries': GlintAPI['listDictionaries'];
  'import-dictionary': GlintAPI['importDictionary'];
  'change-dictionary': GlintAPI['changeDictionary'];
  restart: GlintAPI['restart'];
  quit: GlintAPI['quit'];
}
export type IPCChannel = keyof IPCContract;
export type IPCArgs<K extends IPCChannel> = Parameters<IPCContract[K]>;
export type IPCResult<K extends IPCChannel> = Awaited<ReturnType<IPCContract[K]>>;
