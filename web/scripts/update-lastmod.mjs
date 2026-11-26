// Refresh web/src/data/lastmod.json: record today's date for every course / professor page
// whose content fingerprint changed since the last run (or is new). Unchanged pages keep
// their date. Run after editing course content or professor bios, and commit the file:
//   cd web && npm run update-lastmod
// First run: pass --since=YYYY-MM-DD to date every new entry (e.g. the last content commit).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { publicCourseCatalogue } from '../../functions/api/_course-access.js';
import { PROF_BIOS } from '../src/lib/prof-bios.ts';
import { courseKey, courseFingerprint, professorKey, professorFingerprint } from './lib/lastmod-core.mjs';

const OUT = new URL('../src/data/lastmod.json', import.meta.url);
const since = (process.argv.find((a) => a.startsWith('--since=')) || '').slice(8);
const today = since || new Date().toISOString().slice(0, 10);
const raw = JSON.parse(readFileSync(new URL('../../site/assets/data/courses.json', import.meta.url), 'utf8'));
const published = publicCourseCatalogue(raw).courses.filter((c) => c.status === 'published');
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const store = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const next = {};
let changed = 0;
const put = (key, h) => { const old = store[key]; next[key] = old && old.h === h ? old : { h, d: today }; if (!old || old.h !== h) changed++; };
for (const c of published) put(courseKey(c), courseFingerprint(c));
const byProf = {};
for (const c of published) (byProf[c.professor] ||= []).push(c);
for (const [name, list] of Object.entries(byProf)) put(professorKey(slug(name)), professorFingerprint(PROF_BIOS[name], list));

writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]])), null, 0).replace(/},"/g, '},\n"') + '\n');
console.log(`update-lastmod: ${Object.keys(next).length} pages, ${changed} new or changed (dated ${today}).`);
