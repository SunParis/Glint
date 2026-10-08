import { Button } from '@fluentui/react-components';
import type { Settings } from '../core';
import { Icon, Brand } from './Icon';
import { useToolbarPresentation } from './useToolbarPresentation';
import { perform, toast, useAppState } from './state';
export function Toolbar({ settings, live = false }: { settings: Settings; live?: boolean }) {
  const { snapshot } = useAppState();
  const selectionId = snapshot.selection?.id;
  const ref = useToolbarPresentation(live, selectionId, settings);
  return <div ref={ref} className={'floating-bar ' + (live ? '' : 'sample-bar')}>
    <Button appearance="subtle" size="small" className="mini-brand" data-open-settings aria-label="打开 Glint 设置" title="Glint 设置"
      icon={<Brand />} onClick={() => void perform(() => window.glint.openSettings())} />
    <span className="bar-divider" />
    <div className="bar-actions">{settings.actions.filter(a => a.enabled).map(a => <Button key={a.id}
      appearance="subtle" size="small" className="bar-action" data-run={live ? a.id : undefined}
      data-preview-action={live ? undefined : ''} icon={<Icon name={a.icon} />} aria-label={a.name} title={a.name}
      onClick={() => live ? void perform(async () => { if (selectionId === undefined) return; const r = await window.glint.run(a.id, selectionId); if (!r.ok) toast(r.error || '执行失败', true); }) : toast('点击「测试浮条」体验动作。')}>
      {settings.density === 'compact' ? undefined : a.name}
    </Button>)}</div>
    {live && snapshot.platform.startsWith('linux') && <Button appearance="subtle" size="small" data-dismiss-toolbar aria-label="关闭浮条" title="关闭浮条"
      icon={<Icon name="close" />} onClick={() => void perform(() => window.glint.dismiss())} />}
  </div>;
}
