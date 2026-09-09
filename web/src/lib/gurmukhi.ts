/**
 * Wrap the Gurmukhi runs in a plain-text string so each one gets a real
 * Gurmukhi face and `lang="pa"`.
 *
 * DESIGN.md is explicit: "Every Gurmukhi run: real Gurmukhi face + lang='pa',
 * never smaller than adjacent Latin." That is easy to honour in hand-written
 * markup and easy to lose in DATA — a department's `stance`, a course summary,
 * a track intro are all plain strings that mix an English sentence with a
 * Gurmukhi term, and there is no span to hang the class on. This adds them.
 *
 * Returns HTML, so the input is escaped FIRST and only then wrapped — use with
 * `set:html`. Escaping before wrapping is the whole safety argument: the only
 * markup in the output is the spans this function itself writes.
 *
 * `.gur` is the site-wide treatment from global.css (Gurmukhi face, 1.12em,
 * looser leading — Gurmukhi sits optically smaller than Latin at equal em and
 * carries marks above and below the line).
 */
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const gurmukhiHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ESC[c])
    // A run is one or more Gurmukhi codepoints, plus any further runs joined to
    // it by single spaces or a ZWJ, so "ਸ੍ਰੀ ਗੁਰੂ ਗਰੰਥ ਸਾਹਿਬ ਜੀ" is one span
    // rather than five.
    .replace(/[਀-੿]+(?:[ ‍]+[਀-੿]+)*/g,
      (run) => `<span class="gur" lang="pa">${run}</span>`);
