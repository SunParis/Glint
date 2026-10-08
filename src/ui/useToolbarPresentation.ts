import { useLayoutEffect, useRef } from 'react';
import type { Settings } from '../core';
import { perform } from './state';

// Keep native presentation separate from the toolbar controls. Changes to
// prompts or disabled actions do not affect the visible layout.
export function useToolbarPresentation(live: boolean, selectionId: number | undefined, settings: Pick<Settings, 'density' | 'actions'>) {
  const actionsKey = JSON.stringify(settings.actions.filter(action => action.enabled).map(({ id, name, icon }) => [id, name, icon]));
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!live || selectionId === undefined) return;
    let cancelled = false;
    let lastSize = '';
    let measurement = 0;
    let assetsReady = false;
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const fit = () => {
      const bar = ref.current;
      if (cancelled || !assetsReady || !bar) return;
      const px = (value: string) => Number.parseFloat(value) || 0;
      const style = getComputedStyle(bar), wrap = getComputedStyle(bar.parentElement!);
      const children = [...bar.children] as HTMLElement[];
      const width = children.reduce((sum, child) => {
        const css = getComputedStyle(child);
        return sum + (child.classList.contains('bar-actions') ? child.scrollWidth : child.getBoundingClientRect().width) + px(css.marginLeft) + px(css.marginRight);
      }, 0) + px(style.columnGap) * (children.length - 1) + px(style.paddingLeft) + px(style.paddingRight)
        + px(style.borderLeftWidth) + px(style.borderRightWidth) + px(wrap.paddingLeft) + px(wrap.paddingRight) + 2;
      const height = bar.offsetHeight + px(wrap.paddingTop) + px(wrap.paddingBottom) + 4;
      const size = `${Math.ceil(width)}:${Math.ceil(height)}`;
      if (size === lastSize) return;
      lastSize = size;
      const measured = ++measurement;
      void perform(async () => {
        const layout = await window.glint.fitToolbar(selectionId, width, height);
        if (layout === undefined || cancelled) return;
        // Native sizing and renderer resize notifications are asynchronous. Two
        // frames alone can still belong to the old viewport. Wait for the actual
        // target size, then two stable frames (including the display scale).
        let stableFrames = 0;
        let previousScale = devicePixelRatio;
        while (!cancelled && measured === measurement && stableFrames < 2) {
          await frame();
          const matches = Math.abs(innerWidth - layout.width) <= 1 && Math.abs(innerHeight - layout.height) <= 1;
          stableFrames = matches && devicePixelRatio === previousScale ? stableFrames + 1 : 0;
          previousScale = devicePixelRatio;
        }
        if (!cancelled && measured === measurement) await window.glint.revealToolbar(selectionId, layout.token);
      });
    };
    // CSS masks load asynchronously too. Decode only the icons used by this bar,
    // so its first frame does not briefly contain blank icon slots.
    const icons = [...(ref.current?.querySelectorAll('.icon') ?? [])].map(element => {
      const url = getComputedStyle(element).maskImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      if (!url) return Promise.resolve();
      const image = new Image(); image.src = url;
      return image.decode().catch(() => {});
    });
    void Promise.all([document.fonts.ready, ...icons]).then(() => { assetsReady = true; fit(); });
    // Moving a hidden HWND between display scales can make Windows adjust its
    // bounds again after setBounds. The bar itself may retain the same size, so
    // ResizeObserver alone misses this. Reconcile native bounds on viewport resize.
    const resize = () => { lastSize = ''; fit(); };
    window.addEventListener('resize', resize);
    const observer = new ResizeObserver(fit);
    if (ref.current) observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [live, selectionId, settings.density, actionsKey]);
  return ref;
}
