#!/usr/bin/env node
// i18n key completeness check.
//
// Collects every data-i18n / data-i18n-ph / data-i18n-aria key used in
// web/src/**/*.astro and diffs them against each dictionary in
// web/public/assets/i18n/<lang>.json.
//
//   MISSING key (used in markup, absent from a dictionary)  -> FATAL (exit 1)
//   ORPHAN key (in a dictionary, unused in markup)          -> warning only
//
// Run: node scripts/i18n-extract.mjs   (wired into `npm run check-i18n` in web/)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'web/src');
const I18N_DIR = join(ROOT, 'web/public/assets/i18n');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.astro')) yield p;
  }
}

// Keys appear four ways: as markup attributes, via window.suRelabel(el, key,
// fallback) for JS-driven labels, via setAttribute('data-i18n', key), and
// bound through Astro expressions like data-i18n={l.key} where the key lives
// in a frontmatter array as `key: 'nav.courses'` (Nav.astro's links).
const KEY_RES = [
  /data-i18n(?:-ph|-aria)?=["']([\w.-]+)["']/g,
  /suRelabel\([^,)]+,\s*['"]([\w.-]+)['"]/g,
  /setAttribute\(\s*['"]data-i18n(?:-ph|-aria)?['"]\s*,\s*['"]([\w.-]+)['"]/g,
  /\bkey:\s*['"]((?:nav|footer|home|catalog|course|santhiya|baal|profs|about|programs|paths|cert|verify|teach|cohorts|install|search|login|dash|notfound|feedback|a11y|lang|card)\.[\w.-]+)['"]/g,
];
const used = new Map(); // key -> first file seen
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const re of KEY_RES) {
    for (const m of text.matchAll(re)) {
      if (!used.has(m[1])) used.set(m[1], file.slice(ROOT.length + 1));
    }
  }
}

// --dump: print a key -> English-source map (best-effort text extraction) for
// dictionary authors, then exit.
if (process.argv.includes('--dump')) {
  const en = {};
  const TEXT_RES = [
    /data-i18n=["']([\w.-]+)["'][^>]*>([^<{]+)</g,
    /placeholder=["']([^"']+)["']\s+data-i18n-ph=["']([\w.-]+)["']/g,
    /data-i18n-ph=["']([\w.-]+)["'][^>]*placeholder=["']([^"']+)["']/g,
    /aria-label=["']([^"']+)["']\s+data-i18n-aria=["']([\w.-]+)["']/g,
    /data-i18n-aria=["']([\w.-]+)["'][^>]*aria-label=["']([^"']+)["']/g,
    /suRelabel\([^,)]+,\s*['"]([\w.-]+)['"]\s*,\s*['"]([^'"]+)['"]/g,
  ];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const [i, re] of TEXT_RES.entries()) {
      for (const m of text.matchAll(re)) {
        // Regexes 1 and 3 capture (value, key); the others capture (key, value).
        const [key, val] = (i === 1 || i === 3) ? [m[2], m[1]] : [m[1], m[2]];
        const clean = val.trim();
        if (clean && !(key in en)) en[key] = clean;
      }
    }
  }
  for (const key of used.keys()) if (!(key in en)) en[key] = '';
  console.log(JSON.stringify(en, null, 2));
  process.exit(0);
}

const dicts = readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).sort();
let missingTotal = 0;
let orphanTotal = 0;

for (const dict of dicts) {
  const lang = dict.replace(/\.json$/, '');
  const entries = JSON.parse(readFileSync(join(I18N_DIR, dict), 'utf8'));
  const have = new Set(Object.keys(entries));
  const missing = [...used.keys()].filter((k) => !have.has(k)).sort();
  // "<key>@TODO(native-review)" marks a machine-drafted string awaiting native review; it is metadata, not an orphan.
  const orphans = [...have].filter((k) => !used.has(k) && !k.endsWith('@TODO(native-review)')).sort();
  if (missing.length) {
    missingTotal += missing.length;
    console.error(`✗ ${lang}: ${missing.length} missing key(s):`);
    for (const k of missing) console.error(`    ${k}  (used in ${used.get(k)})`);
  }
  if (orphans.length) {
    orphanTotal += orphans.length;
    console.warn(`⚠ ${lang}: ${orphans.length} orphan key(s) (in dictionary, unused in markup): ${orphans.join(', ')}`);
  }
  if (!missing.length && !orphans.length) console.log(`✓ ${lang}: complete (${have.size} keys)`);
}

console.log(`check-i18n: ${used.size} keys in markup, ${dicts.length} dictionaries, ${missingTotal} missing, ${orphanTotal} orphans`);
if (missingTotal) {
  console.error('check-i18n: FAIL — add the missing keys to every dictionary (translations ship complete).');
  process.exit(1);
}
