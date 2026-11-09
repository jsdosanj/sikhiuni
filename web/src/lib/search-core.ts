// Pure search helpers for /search (web/src/pages/search.astro). Kept here, not
// inline in the page, so they are unit-tested (test/search-core.test.ts).

/** Fold text for matching: lowercase, NFC, strip Latin diacritics, and collapse
 *  common romanisation variants so "Saahib"/"Sahib", "Jaapu"/"Japu",
 *  "Gurbaanee"/"Gurbani" meet. Gurmukhi and other scripts pass through unchanged
 *  (the combining-mark strip is limited to U+0300-U+036F). */
export function fold(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC')
    .toLowerCase()
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/ii/g, 'i').replace(/uu/g, 'u');
}

/** Query terms, with a few common synonyms expanded (each alternative counts as
 *  the same term). Returns a list of alternatives per term. */
const SYNONYMS: Record<string, string[]> = {
  sikhism: ['sikhi'], sikhi: ['sikhism'],
  sggs: ['guru granth'], granth: ['granth'],
  gurmukhi: ['gurmukhi', 'punjabi'], punjabi: ['punjabi', 'gurmukhi'],
  kirtan: ['kirtan', 'sangeet'], music: ['sangeet', 'kirtan'],
  certificate: ['certificate', 'program'], certificates: ['certificate', 'program'],
};
export function queryTerms(q: string): string[][] {
  return fold(q).split(/\s+/).filter(Boolean).map((t) => [t, ...(SYNONYMS[t] || [])]);
}

/** True if a and b differ by at most one edit (insert/delete/substitute). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Score one term against one field: 2 = word-start substring, 1 = mid-word,
 *  0.75 = one typo away from a whole word (terms of 4+ letters only), 0 = none. */
export function fieldScore(field: string, term: string): number {
  if (!field || !term) return 0;
  const i = field.indexOf(term);
  if (i !== -1) return i === 0 || !/[\p{L}\p{N}]/u.test(field[i - 1]) ? 2 : 1;
  if (term.length >= 4) {
    for (const w of field.split(/[^\p{L}\p{N}]+/u)) if (w.length >= 4 && withinOneEdit(w, term)) return 0.75;
  }
  return 0;
}

export interface Entry { t: string; p: string; o: string; b: string; }

/** Field-weighted score (title 5x, professor 3x, topic 2x, body 1x), with an
 *  all-terms bonus and an exact-phrase-in-title bonus. Fields must be fold()ed. */
export function scoreEntry(r: Entry, terms: string[][], phrase: string): number {
  let score = 0, present = 0;
  for (const alts of terms) {
    let best = 0;
    for (const t of alts) {
      const hit = fieldScore(r.t, t) * 5 + fieldScore(r.p, t) * 3 + fieldScore(r.o, t) * 2 + fieldScore(r.b, t);
      if (hit > best) best = hit;
    }
    if (best) present++;
    score += best;
  }
  if (!score) return 0;
  if (present === terms.length) score += 4;
  if (phrase && r.t.indexOf(phrase) !== -1) score += 20;
  return score;
}
