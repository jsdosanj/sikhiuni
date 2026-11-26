// Content fingerprints for sitemap <lastmod>. Shared by the build (web/src/lib/sitemap.ts)
// and by `npm run update-lastmod`, so both compute exactly the same hash.
//
// Google ignores <lastmod> when it is always the build date (every URL "changed" on every
// deploy). Instead each course / professor page carries the date its own content last
// changed: web/src/data/lastmod.json stores { key: { h: hash, d: "YYYY-MM-DD" } }. If the
// content no longer matches the stored hash, the build uses the build date (it did change)
// until `npm run update-lastmod` records the new hash and date.
import { createHash } from 'node:crypto';

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
export const fingerprint = (v) => createHash('sha256').update(stable(v)).digest('hex').slice(0, 16);

/** Everything that appears on a course page. */
export const courseKey = (c) => `course:${c.id}`;
export const courseFingerprint = (c) => fingerprint(c);

/** A professor page: the bio plus the titles and levels of the courses it lists. */
export const professorKey = (slug) => `professor:${slug}`;
export const professorFingerprint = (bio, courses) =>
  fingerprint({ bio: bio || '', courses: courses.map((c) => [c.id, c.title, c.level, c.summary]).sort() });

/** Stored date when the fingerprint still matches, otherwise `fallback` (the build date). */
export function lastmodFor(store, key, hash, fallback) {
  const e = store && store[key];
  return e && e.h === hash ? e.d : fallback;
}
