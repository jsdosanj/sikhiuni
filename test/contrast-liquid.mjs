// Build gate: text on liquid glass (WCAG 2.2 AA, 4.5:1). Reads the token
// values live from web/src/styles/liquid.css and composites each glass tint
// over the grounds it can meet, in both themes. A later tweak to a tint, an
// ink or an accent that drops below AA fails the build here.
//
//   • card glass (--lq-glass-tint) and blurred glass (--lq-glass-tint-blur)
//     sit over the page ground (--lq-bg-0, --lq-bg-1).
//   • shell glass (--lq-glass-tint-shell: rail, tab bar, lesson dock) floats
//     over anything, so it is checked over the darkest and lightest grounds
//     the site has (midnight #0A1729 and white).
//   • the navy top bar is checked for white text over a white page.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web', 'src', 'styles', 'liquid.css'), 'utf8');
const block = (marker) => { const i = css.indexOf(marker); if (i === -1) throw new Error(`contrast-liquid: marker not found: ${marker}`); return css.slice(i, css.indexOf('\n}', i)); };
const light = block('.lq {');
const dark = block("[data-theme='dark'] .lq {");
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const token = (b, name, fallback) => {
  const m = b.match(new RegExp(`--lq-${name}:\\s*([^;]+);`));
  if (!m) { if (fallback) return token(fallback, name); throw new Error(`contrast-liquid: --lq-${name} not found`); }
  return m[1].trim();
};
const colour = (v) => {
  if (v.startsWith('#')) return { rgb: hex(v), a: 1 };
  const m = v.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map((x) => Number(x.trim()));
  return { rgb: p.slice(0, 3), a: p[3] ?? 1 };
};
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (top, bot) => top.rgb.map((c, i) => top.a * c + (1 - top.a) * bot[i]);

let checked = 0;
const failures = [];
const check = (label, fg, bg, min = 4.5) => { checked++; const c = contrast(fg, bg); if (c < min) failures.push(`${label}: ${c.toFixed(2)}:1`); };

for (const [theme, b] of [['light', light], ['dark', dark]]) {
  const t = (name) => colour(token(b, name, light));
  const grounds = { 'bg-0': t('bg-0').rgb, 'bg-1': t('bg-1').rgb };
  const inks = ['ink', 'ink-2', 'ink-3', 'accent', 'accent-strong', 'good'];
  for (const ink of inks) {
    check(`${theme}/backing/${ink}`, t(ink).rgb, t('glass-backing').rgb);
    check(`${theme}/reading/${ink}`, t(ink).rgb, t('reading-bg').rgb);
    for (const [gn, g] of Object.entries(grounds)) {
      check(`${theme}/tint over ${gn}/${ink}`, t(ink).rgb, over(t('glass-tint'), g));
      check(`${theme}/blur over ${gn}/${ink}`, t(ink).rgb, over(t('glass-tint-blur'), g));
    }
    // The shell carries ink, ink-2 and the accent; ink-3 and good are not used on it.
    if (ink === 'ink-3' || ink === 'good') continue;
    check(`${theme}/shell over midnight/${ink}`, t(ink).rgb, over(t('glass-tint-shell'), hex('#0A1729')));
    check(`${theme}/shell over white/${ink}`, t(ink).rgb, over(t('glass-tint-shell'), [255, 255, 255]));
  }
  check(`${theme}/on-gold on gold`, t('on-gold').rgb, t('gold').rgb);
  check(`${theme}/on-gold on gold-strong`, t('on-gold').rgb, t('gold-strong').rgb);
  check(`${theme}/on-accent on accent`, t('on-accent').rgb, t('accent').rgb);
  check(`${theme}/on-accent on accent-strong`, t('on-accent').rgb, t('accent-strong').rgb);
}
// Top bar: white text on navy glass at its lightest stop, over a white page.
check('nav/white over white page', [255, 255, 255], over({ rgb: [16, 38, 70], a: 0.84 }, [255, 255, 255]));

if (failures.length) {
  console.error('contrast-liquid: FAIL, pair(s) below 4.5:1');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`contrast-liquid: OK, ${checked} text and glass pairs at 4.5:1 or better`);
