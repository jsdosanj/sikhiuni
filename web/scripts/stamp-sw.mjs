// Stamp the service worker's cache key with a hash of the built assets, so
// every deploy that changes anything ships a new SW → `activate` purges the old
// app-shell cache → returning users always get the current HTML/CSS/JS. Runs in
// `npm run build` right after `astro build`, editing dist/sw.js in place.
//
// Before this, `var CACHE = 'su-web-v25'` was hand-bumped and hadn't changed in
// months, so the SW kept serving a stale shell (blank pages, "atlas unavailable"
// until a hard refresh).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SW = 'dist/sw.js';
if (!existsSync(SW)) {
  console.warn('stamp-sw: dist/sw.js not found — skipping');
  process.exit(0);
}

// Astro content-hashes every JS/CSS chunk, so the sorted list of _astro/
// filenames changes exactly when the built output changes.
const astroDir = 'dist/_astro';
const names = existsSync(astroDir) ? readdirSync(astroDir).sort() : [];
// Fold in the SW's own source + a couple of top-level HTML files so a
// content-only change to those still bumps the key.
const extra = ['dist/sw.js', 'dist/index.html', 'dist/offline.html']
  .filter(existsSync)
  .map((f) => readFileSync(f, 'utf-8'));

const hash = createHash('sha256')
  .update(names.join('\n'))
  .update(extra.join('\n'))
  .digest('hex')
  .slice(0, 12);

const src = readFileSync(SW, 'utf-8');
if (!src.includes('__BUILD__')) {
  console.warn('stamp-sw: no __BUILD__ token in dist/sw.js — did the source change?');
  process.exit(0);
}
writeFileSync(SW, src.replace(/__BUILD__/g, hash));
console.log(`stamp-sw: cache key -> su-web-v27-${hash} (${names.length} asset chunks)`);
