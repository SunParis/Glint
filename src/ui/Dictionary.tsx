import { useEffect, useState } from 'react';
import { Button, MessageBar, MessageBarBody, Spinner, Switch } from '@fluentui/react-components';
import type { CustomDictionary, GlintAPI } from '../core';
import { SettingSwitch } from './controls';
import { Icon } from './Icon';
import { toast } from './state';

export function Dictionary() {
  const [items, setItems] = useState<CustomDictionary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    window.glint.listDictionaries().then(value => { if (active) setItems(value); }, () => { if (active) setError('词典列表无法读取。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const operate = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setItems(await window.glint.listDictionaries()); }
    catch (error) { setError(error instanceof Error ? error.message : '词典更新失败。'); }
    finally { setBusy(false); }
  };
  const change = (id: string, action: Parameters<GlintAPI['changeDictionary']>[1]) => void operate(() => window.glint.changeDictionary(id, action));
  return <><p className="page-description">词典查询仅用于内置「翻译」动作，支持英文单词；润色、解释和自建动作仍使用模型。</p>
    <section className="panel form-panel">
      <SettingSwitch label="单词优先查词典" description="命中词条时离线显示释义；未收录的词和句子使用模型。" field="dictionaryEnabled" />
      <div className="panel-heading"><h3>内置词典</h3><span className="subtle-badge">离线</span></div>
      <div><strong>ECDICT 英汉词典</strong><p className="dictionary-forms">精简词库 · 58,226 个词条 · 释义、音标与词形变化</p></div>
    </section>
    <section className="panel dictionary-panel" aria-busy={busy || loading}>
      <div className="panel-heading"><h3>自定义词典</h3><Button size="small" data-import-dictionary disabled={busy || loading || items.length >= 12} icon={busy ? <Spinner size="tiny" /> : <Icon name="plus" />}
        onClick={() => void operate(async () => { const result = await window.glint.importDictionary(); if (!result.ok) throw new Error(result.error); if (!result.cancelled) toast('词典已导入'); })}>{busy ? '处理中…' : '导入 MDX'}</Button></div>
      <p className="dictionary-note">按列表顺序优先查询，未命中时使用内置词典。导入、启停和排序立即生效。</p>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      <div className="dictionary-list" role="list" aria-label="自定义词典">{loading ? <Spinner size="small" aria-label="读取词典" /> : items.length ? items.map((item, index) =>
        <div className="dictionary-row" role="listitem" key={item.id} data-dictionary-id={item.id}>
          <Icon name="book-a" /><div className="dictionary-info"><strong title={item.name}>{item.name}</strong><span>{item.entries.toLocaleString()} 个词条 · MDX</span></div>
          <Switch checked={item.enabled} disabled={busy} aria-label={`启用 ${item.name}`} onChange={(_, data) => change(item.id, data.checked ? 'enable' : 'disable')} />
          <Button appearance="subtle" size="small" disabled={busy || index === 0} aria-label={`上移 ${item.name}`} title="上移" icon={<Icon name="arrow-up" />} onClick={() => change(item.id, 'up')} />
          <Button appearance="subtle" size="small" disabled={busy || index === items.length - 1} aria-label={`下移 ${item.name}`} title="下移" icon={<Icon name="arrow-down" />} onClick={() => change(item.id, 'down')} />
          <Button appearance="subtle" size="small" disabled={busy} aria-label={`移除 ${item.name}`} title="移除词典（保留原文件）" icon={<Icon name="trash" />} onClick={() => change(item.id, 'remove')} />
        </div>) : <p className="dictionary-empty">尚未导入词典。解压下载的词典包后，选择其中的 .mdx 文件。</p>}</div>
      <p className="dictionary-note">支持 MDX 1.x / 2.x 的文字释义；暂不支持密码保护、MDX 3、MDD 图片与发音、外部样式。导入会保留一份本地副本，移除不会删除原文件。</p>
    </section>
  </>;
}
