#!/usr/bin/env node
// Regenerate web/public/assets/gurbani/santhya-sggs-index.json with true
// per-Ang entries — fully offline, reads scripts/sggs-verified-angs.json
// (the committed, R2-upload-verified list of Angs that now have their own
// dedicated recording by Bhagat Jaswant Singh Ji Daudar under R2 key prefix
// santhya/sggs/) plus the CURRENT index (for the handful of Angs missing a
// per-Ang file, which fall back to whichever old gurmatveechar.com range
// already covers them).
//
// Ordering is load-bearing, not stylistic: web/src/pages/santhiya.astro's
// trackFor(n) is a first-match-wins linear scan, so a wide fallback range
// spliced in at its "natural" sorted position would shadow the correct
// per-Ang entries for every OTHER Ang inside that range too. Fallback
// entries are therefore appended at the very end of the array, after every
// per-Ang entry — see the comment at the emit step below.
import { readFileSync, writeFileSync } from 'node:fs';

const OLD = JSON.parse(readFileSync('web/public/assets/gurbani/santhya-sggs-index.json', 'utf8'));
const verified = new Set(JSON.parse(readFileSync('scripts/sggs-verified-angs.json', 'utf8')));
const MAX_ANG = 1430;

function oldRangeFor(n) {
  for (const r of OLD) {
    if (n >= r.start && n <= r.end) return r;
  }
  throw new Error(`Ang ${n} has no per-Ang file AND is not covered by the old index — cannot build a safe fallback`);
}

const perAng = [];
const missing = [];
for (let n = 1; n <= MAX_ANG; n++) {
  if (verified.has(n)) {
    perAng.push({ start: n, end: n, url: `/media/santhya/sggs/${n}.mp3`, title: `Ang ${n}` });
  } else {
    missing.push(n);
  }
}

// One fallback entry per distinct old-range URL that still needs to cover a
// missing Ang (dedup, since two missing Angs could share the same old wide
// range) — tagged `attr` so santhiya.astro's updateNote() can show the
// correct (different) reciter credit for just these Angs, with no other UI
// change needed.
const seenUrls = new Map();
for (const n of missing) {
  const r = oldRangeFor(n);
  if (!seenUrls.has(r.url)) {
    seenUrls.set(r.url, { ...r, attr: 'Bhindrān Taksāl (gurmatveechar.com)' });
  }
}
const fallbacks = [...seenUrls.values()];

const index = [...perAng, ...fallbacks]; // fallbacks MUST stay last — see header comment
writeFileSync('web/public/assets/gurbani/santhya-sggs-index.json', JSON.stringify(index, null, 1) + '\n');

console.log(`santhya-sggs-index: ${perAng.length} per-Ang entries (Bhagat Jaswant Singh Ji Daudar) + ${fallbacks.length} fallback range(s) (${missing.length} Ang(s): ${missing.join(', ')})`);
