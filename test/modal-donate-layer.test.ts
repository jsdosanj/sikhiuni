import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps the fixed Donate link below the existing modal and More sheet layers', () => {
  const source = readFileSync(new URL('../web/src/layouts/Base.astro', import.meta.url), 'utf8');
  const rule = source.match(/\.network-donate-fixed\{([^}]+)\}/)?.[1];
  expect(rule).toBeTruthy();
  const z = Number(rule?.match(/z-index:(\d+)/)?.[1]);
  expect(z).toBeLessThan(50);
  expect(source).toContain('id="su-modal-ov" class="fixed inset-0 z-[70]');
});

it('clears the mobile footer on the left and hides floating utilities while navigation is open', () => {
  const source = readFileSync(new URL('../web/src/layouts/Base.astro', import.meta.url), 'utf8');
  expect(source).toContain('@media(max-width:767px)');
  expect(source).toContain('left:max(16px,env(safe-area-inset-left));right:auto;bottom:calc(52px + env(safe-area-inset-bottom,0px) + 12px)');
  for (const target of ['.network-donate-fixed', '#a11y-fab', '#a11y-panel']) {
    expect(source).toContain('body:has(#nav-toggle[aria-expanded="true"]) ' + target);
    expect(source).toContain('body:has(#su-dept-sheet:not([hidden])) ' + target);
  }
  expect(source).toContain('visibility:hidden;pointer-events:none');
});

it('reserves a full44px navigation toggle in narrow mobile headers', () => {
  const source = readFileSync(new URL('../web/src/layouts/Base.astro', import.meta.url), 'utf8');
  expect(source).toContain('@media(max-width:374px)');
  expect(source).toContain('.su-nav > .wrap > a:first-child{min-width:0;flex-shrink:1;gap:8px}');
  expect(source).toContain('.su-nav > .wrap > a:first-child span{font-size:20px!important}');
  expect(source).toContain('.su-nav #nav-toggle{flex:0 0 44px;width:44px;height:44px;margin-left:0}');
});
