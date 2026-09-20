// ਯਾਦ ਪੱਤੇ — Yaad Patte (Memory Cards): a spaced-repetition RECALL game for the
// santhiya games arcade. A Leitner deck of the Painti + Navin letters — a
// genuinely different pedagogy from the other 4 games (scheduled long-term
// recall vs. single-session recognition/matching/building), re-platforming
// the same box/due-date algorithm already live in baal-updesh.astro's
// #flashcards section (its course-term/word deck), scoped down to just the
// letters so this game needs zero new content sourcing.
//
// SITE LAWS honored here:
//  • NO emoji (check-no-emoji gate). Glyphs drawn only via icons.ts iconSvg().
//  • NO new data-i18n attributes — every UI string stays plain; runtime MT translates it.
//  • ALL Gurmukhi is COPIED VERBATIM from repo sources, never typed from memory. Each
//    Gurmukhi-bearing constant below carries a source comment naming its origin file.
//  • localStorage: only through kit.ts's getCard/setCard (su_v1_games_cards).
//  • No inline <script>/handlers — this is a plain .ts module bundled by Astro.
//  • prefers-reduced-motion: this game has no motion beyond the shared celebrate().
//  • Touch targets >= 44px.

import { iconSvg } from '../icons';
import { celebrate, getCard, setCard } from './kit';

// ── Deck: the Painti (35) + Navin Toli (6) letters ─────────────────────────
// COPIED VERBATIM from web/src/pages/baal-updesh.astro: `const akhar` (the 35
// Painti, lines 6–14) followed by `const navin` (the 6 Navin Toli, line 15) —
// the identical array already verbatim-copied once before into jodi-match.ts.
// [glyph, name]. Do not retype — accuracy is sacred.
const LETTERS: [string, string][] = [
  ['ੳ', 'Ura'], ['ਅ', 'Aira'], ['ੲ', 'Iri'], ['ਸ', 'Sassa'], ['ਹ', 'Haha'],
  ['ਕ', 'Kakka'], ['ਖ', 'Khakha'], ['ਗ', 'Gagga'], ['ਘ', 'Ghagha'], ['ਙ', 'Nganga'],
  ['ਚ', 'Chacha'], ['ਛ', 'Chhachha'], ['ਜ', 'Jajja'], ['ਝ', 'Jhajha'], ['ਞ', 'Njanja'],
  ['ਟ', 'Tainka'], ['ਠ', 'Tthattha'], ['ਡ', 'Dadda'], ['ਢ', 'Dhadha'], ['ਣ', 'Nanha'],
  ['ਤ', 'Tatta'], ['ਥ', 'Thatha'], ['ਦ', 'Dadda'], ['ਧ', 'Dhadha'], ['ਨ', 'Nanna'],
  ['ਪ', 'Pappa'], ['ਫ', 'Phapha'], ['ਬ', 'Babba'], ['ਭ', 'Bhabha'], ['ਮ', 'Mamma'],
  ['ਯ', 'Yaiya'], ['ਰ', 'Rara'], ['ਲ', 'Lalla'], ['ਵ', 'Vava'], ['ੜ', 'Rrarra'],
  ['ਸ਼', 'Shasha'], ['ਖ਼', 'Khhakha'], ['ਗ਼', 'Ghhagha'], ['ਜ਼', 'Zazza'], ['ਫ਼', 'Faffa'], ['ਲ਼', 'Llalla'],
];

// Same schedule as baal-updesh.astro's #flashcards Leitner engine (line 556):
// days by box (1-5). Card ids are prefixed so they can never collide with any
// other kit.ts consumer sharing the su_v1_games_cards namespace.
const INTERVALS = [0, 1, 3, 7, 16, 40];
const idFor = (i: number) => `yaad-patte-${i}`;

type Ctx = { kid: boolean; onScore(stars: number): void; done(): void };
type Game = {
  id: string; title: string; gur: string; blurb: string; needsAudio?: boolean;
  mount(body: HTMLElement, ctx: Ctx): () => void;
};

function el(tag: string, cls?: string): HTMLElement {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const game: Game = {
  id: 'yaad-patte',
  title: 'Yaad Patte',
  gur: 'ਯਾਦ ਪੱਤੇ', // COPIED VERBATIM from web/src/pages/baal-updesh.astro (line 323: the
  // Flashcards section's own Gurmukhi title) — this game re-platforms exactly that
  // section's Leitner engine, so reusing its name is both accurate and apt.
  blurb: 'A spaced-repetition deck of the letters — review the ones due, at your own pace.',
  mount(body, ctx) {
    const timers = new Set<number>();
    const after = (ms: number, fn: () => void): void => {
      const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };

    const deck = LETTERS.map((pair, i) => ({ id: idFor(i), glyph: pair[0], name: pair[1] }));
    const due = (c: { id: string }) => getCard(c.id).due <= Date.now();

    let pool = shuffle(deck.slice()).sort((a, b) => getCard(a.id).due - getCard(b.id).due);
    let queue = pool.filter(due);
    if (!queue.length) queue = pool.slice(); // nothing due yet — review the whole deck anyway
    let idx = 0;
    let flipped = false;
    let gotItFirstTry = true; // for the "everything right first pass" bonus star

    body.innerHTML = '';
    const stats = el('div', 'grid grid-cols-2 gap-3 font-sans text-xs text-muted');
    const cardWrap = el('div', 'mt-4');
    body.append(stats, cardWrap);

    function paintStats(): void {
      stats.innerHTML = `<div class="glass-lite border-t-4 border-t-saffron p-3 text-center"><div class="text-xl font-bold text-navy">${queue.length - idx}</div><div>Left this round</div></div><div class="glass-lite border-t-4 border-t-saffron p-3 text-center"><div class="text-xl font-bold text-navy">${deck.filter((c) => getCard(c.id).box >= 5).length}</div><div>Mastered</div></div>`;
    }

    function render(): void {
      paintStats();
      if (idx >= queue.length) {
        cardWrap.innerHTML = '';
        const doneCard = el('div', 'glass-lite p-8 text-center');
        doneCard.innerHTML = `<div class="flex justify-center text-ok">${iconSvg('check-square', 'h-10 w-10')}</div><h3 class="mt-2 font-serif text-lg font-bold text-navy">Round complete</h3><p class="mt-1 text-sm text-muted">You reviewed ${queue.length} letter${queue.length === 1 ? '' : 's'}. Come back later for the ones due next.</p>`;
        cardWrap.appendChild(doneCard);
        finish();
        return;
      }
      const c = queue[idx];
      cardWrap.innerHTML = '';
      const box = el('div', 'glass-lite mx-auto flex min-h-[200px] max-w-md cursor-pointer select-none flex-col items-center justify-center p-8 text-center') as HTMLDivElement;
      if (flipped) {
        const name = el('div', 'text-2xl font-semibold text-navy');
        name.textContent = c.name; // verbatim from LETTERS above
        box.appendChild(name);
      } else {
        const g = el('div', 'gur text-6xl font-bold text-navy') as HTMLDivElement;
        g.lang = 'pa';
        g.textContent = c.glyph; // verbatim from LETTERS above
        box.appendChild(g);
        const hint = el('div', 'mt-4 font-sans text-xs text-muted');
        hint.textContent = 'tap to reveal';
        box.appendChild(hint);
      }
      box.addEventListener('click', () => { flipped = !flipped; render(); });
      cardWrap.appendChild(box);

      if (flipped) {
        const row = el('div', 'mx-auto mt-4 flex max-w-md gap-3');
        const soon = el('button', 'btn flex-1') as HTMLButtonElement;
        soon.type = 'button';
        soon.textContent = '↺ Review soon';
        soon.addEventListener('click', () => grade(false));
        const got = el('button', 'btn btn-primary flex-1') as HTMLButtonElement;
        got.type = 'button';
        got.innerHTML = `${iconSvg('check', 'h-4 w-4')} <span>Got it</span>`;
        got.addEventListener('click', () => grade(true));
        row.append(soon, got);
        cardWrap.appendChild(row);
      } else {
        const row = el('div', 'mx-auto mt-4 max-w-md text-center');
        const flip = el('button', 'btn') as HTMLButtonElement;
        flip.type = 'button';
        flip.textContent = 'Reveal';
        flip.addEventListener('click', () => { flipped = true; render(); });
        row.appendChild(flip);
        cardWrap.appendChild(row);
      }
      const p = el('p', 'mt-3 text-center font-sans text-xs text-muted');
      p.textContent = `Card ${idx + 1} of ${queue.length} · space = flip · 1 = review soon · 2 = got it`;
      cardWrap.appendChild(p);
    }

    function grade(ok: boolean): void {
      const c = queue[idx];
      if (!c) return;
      if (!ok) gotItFirstTry = false;
      const st = getCard(c.id);
      const box = ok ? Math.min(5, st.box + 1) : 1;
      const days = INTERVALS[Math.min(box, INTERVALS.length - 1)];
      setCard(c.id, { box, due: Date.now() + days * 86400000 });
      idx++;
      flipped = false;
      render();
    }

    let finished = false;
    function finish(): void {
      if (finished) return;
      finished = true;
      const stars = 1 + (gotItFirstTry && queue.length > 0 ? 1 : 0);
      celebrate(body);
      after(0, () => { ctx.onScore(stars); ctx.done(); });
    }

    document.addEventListener('keydown', onKey);
    function onKey(e: KeyboardEvent): void {
      if (idx >= queue.length) return;
      if (e.key === ' ') { e.preventDefault(); flipped = !flipped; render(); }
      else if (flipped && e.key === '1') grade(false);
      else if (flipped && e.key === '2') grade(true);
    }

    render();

    return () => {
      document.removeEventListener('keydown', onKey);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      body.innerHTML = '';
    };
  },
};
