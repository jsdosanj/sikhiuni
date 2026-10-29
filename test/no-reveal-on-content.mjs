// Build gate: learning content must NEVER be gated behind the scroll-reveal
// observer. A production incident (PR #195) shipped course pages whose entire
// main column stayed opacity:0 because `.reveal` sat on sections too tall for
// the IntersectionObserver threshold. This gate locks the law from DESIGN.md:
// on course pages, public outlines carry no `reveal` class; lesson content now loads only after authentication.
//
// Runs after `astro build` (wired into web/package.json). Exits 1 on violation.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web', 'dist');
const courseDir = join(dist, 'course');

let files;
try {
  files = readdirSync(courseDir).filter((f) => f.endsWith('.html'));
} catch {
  console.error('no-reveal-on-content: web/dist/course not found — run after astro build');
  process.exit(1);
}
if (files.length === 0) {
  console.error('no-reveal-on-content: no course pages in dist');
  process.exit(1);
}

let gatedCount = 0;
const errors = [];
for (const f of files) {
  const html = readFileSync(join(courseDir, f), 'utf8');
  // Institutional/paid-cohort courses (see functions/api/course-content.js) are
  // DELIBERATELY reveal-gated by design — full content is fetched client-side
  // only for entitled users, never shipped in the raw HTML. Identified by the
  // teaser markup's own id (web/src/pages/course/[id].astro), not by re-reading
  // courses.json here. The no-`reveal`-class check below still applies to them.
  const isGated = html.includes('id="gated-teaser"');
  if (isGated) gatedCount++;
  // Content present in raw HTML (readable with JS disabled) — free courses only.
  if (!isGated && !html.includes('lesson-prose')) {
    errors.push(`${f}: no lesson-prose content in raw HTML`);
  }
  // No element on a course page may be reveal-gated. class="reveal" or
  // class="... reveal ..." both match; "revealed"/data-reveal-ready don't.
  const m = html.match(/class="[^"]*\breveal\b[^"]*"/);
  if (m) errors.push(`${f}: reveal-gated element: ${m[0].slice(0, 80)}`);
}

if (errors.length) {
  console.error(`no-reveal-on-content: FAIL (${errors.length})`);
  for (const e of errors.slice(0, 10)) console.error('  ' + e);
  process.exit(1);
}
console.log(`no-reveal-on-content: OK — ${files.length} course pages (${gatedCount} gated, teaser-only by design), ` +
  `public outline placeholders for the rest, zero scroll-reveal-gated elements`);
