// ਮੁਹਾਰਨੀ — Muharni Match: a matra-RECOGNITION game for the santhiya games
// arcade. Shown a consonant + a named vowel sign (matra), pick the correctly
// formed combined glyph among four. None of the other arcade games test a
// matra in isolation — jodi-match matches whole letters, shabad-builder
// embeds matras inside word tiles, akhar-pop tests whole-letter listening —
// so this is the first game to drill the actual core discipline of Santhya:
// telling the ten laga-matra apart.
//
// SITE LAWS honored here:
//  • NO emoji (check-no-emoji gate). Glyphs drawn only via icons.ts iconSvg().
//  • NO new data-i18n attributes — every UI string stays plain; runtime MT translates it.
//  • ALL Gurmukhi is COPIED VERBATIM from repo sources, never typed from memory. Each
//    Gurmukhi-bearing constant below carries a source comment naming its origin file.
//  • localStorage: this module writes NONE (progress/stars/streak are the integrator's
//    job via ctx + kit).
//  • No inline <script>/handlers — this is a plain .ts module bundled by Astro.
//  • prefers-reduced-motion gates the bubble float animation (frozen when reduced).
//  • Touch targets >= 44px (bubbles are >= 96px; larger again in kid mode).
//
// No audio: web/public/assets/audio/akhar/manifest.json's categories (including
// "muharni") are all empty today, so this game is intentionally text/glyph-only.

import { celebrate } from './kit';

// ── Muharni data — COPIED VERBATIM from web/src/pages/baal-updesh.astro,
// `const consonants` (line 17), `const matras` (line 18), `const matraNames`
// (line 19). The combined-glyph composition (consonant + matra) matches the
// identical concatenation the Muharni table itself uses (same file, ~line 193).
// Do not retype — accuracy is sacred.
const CONSONANTS = ['ਸ', 'ਹ', 'ਕ', 'ਖ', 'ਗ', 'ਘ', 'ਙ', 'ਚ', 'ਛ', 'ਜ', 'ਝ', 'ਞ', 'ਟ', 'ਠ', 'ਡ', 'ਢ', 'ਣ', 'ਤ', 'ਥ', 'ਦ', 'ਧ', 'ਨ', 'ਪ', 'ਫ', 'ਬ', 'ਭ', 'ਮ', 'ਯ', 'ਰ', 'ਲ', 'ਵ', 'ੜ'];
const MATRAS = ['', 'ਾ', 'ਿ', 'ੀ', 'ੁ', 'ੂ', 'ੇ', 'ੈ', 'ੋ', 'ੌ'];
const MATRA_NAMES = ['ਮੁਕਤਾ', 'ਕੰਨਾ', 'ਸਿਹਾਰੀ', 'ਬਿਹਾਰੀ', 'ਔਂਕੜ', 'ਦੁਲੈਂਕੜ', 'ਲਾਂ', 'ਦੁਲਾਵਾਂ', 'ਹੋੜਾ', 'ਕਨੌੜਾ'];

const ROUNDS = 8;

type Ctx = { kid: boolean; onScore(stars: number): void; done(): void };
type Game = {
  id: string; title: string; gur: string; blurb: string; needsAudio?: boolean;
  mount(body: HTMLElement, ctx: Ctx): () => void;
};
type Round = { consonant: string; matraIdx: number };

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

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

// 3 stars for near-perfect, 2 for solid, 1 for finishing at all.
function starsFor(correct: number): number {
  if (correct >= ROUNDS - 1) return 3;
  if (correct >= Math.ceil(ROUNDS * 0.6)) return 2;
  return 1;
}

export const game: Game = {
  id: 'muharni-match',
  title: 'Muharni Match',
  gur: 'ਮੁਹਾਰਨੀ', // COPIED VERBATIM from web/src/pages/baal-updesh.astro (line 161).
  blurb: 'See a consonant and a vowel sign’s name, then pick the letter formed correctly.',
  mount(body, ctx) {
    const reduced =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const kid = ctx.kid;
    const optionCount = kid ? 2 : 4;

    const timers = new Set<number>();
    const after = (ms: number, fn: () => void): void => {
      const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };

    // Build the round sequence: cycle+shuffle over consonant x matra pairs so
    // we never repeat too soon, matching akhar-pop's bag-shuffle approach.
    const seq: Round[] = [];
    let bag: Round[] = [];
    while (seq.length < ROUNDS) {
      if (bag.length === 0) {
        const all: Round[] = [];
        for (const c of CONSONANTS) for (let m = 0; m < MATRAS.length; m++) all.push({ consonant: c, matraIdx: m });
        bag = shuffle(all);
      }
      const next = bag.pop() as Round;
      if (seq.length && seq[seq.length - 1].consonant === next.consonant && seq[seq.length - 1].matraIdx === next.matraIdx) {
        bag.unshift(next);
        continue;
      }
      seq.push(next);
    }

    let round = 0;
    let correct = 0;
    let answered = false;

    body.innerHTML = '';

    const instr = el('p', 'text-sm text-muted');
    instr.textContent = kid
      ? 'Which letter has this sound?'
      : 'Read the consonant and the vowel sign named below it, then tap the letter formed correctly.';

    const bar = el('div', 'mt-3 mb-4 flex items-center justify-between gap-3 font-sans text-sm text-muted');
    const roundEl = el('span');
    const scoreEl = el('span');
    bar.append(roundEl, scoreEl);

    // The prompt: big consonant + the target matra's name underneath.
    const prompt = el('div', 'mb-5 flex flex-col items-center gap-1');
    const promptGlyph = el('div', 'gur font-bold text-navy text-6xl') as HTMLDivElement;
    promptGlyph.lang = 'pa';
    const promptName = el('div', 'gur text-lg font-semibold text-saffron-deep') as HTMLDivElement;
    promptName.lang = 'pa';
    prompt.append(promptGlyph, promptName);

    const grid = el('div', 'grid grid-cols-2 gap-4');
    body.append(instr, bar, prompt, grid);

    function renderRound(): void {
      answered = false;
      roundEl.textContent = `Round ${round + 1} / ${ROUNDS}`;
      scoreEl.textContent = `Correct: ${correct}`;

      const r = seq[round];
      promptGlyph.textContent = r.consonant;
      promptName.textContent = MATRA_NAMES[r.matraIdx];

      const answerGlyph = r.consonant + MATRAS[r.matraIdx];
      // Distractors: the SAME consonant with other matras — this is the whole
      // point (tests telling matras apart, not telling consonants apart).
      const otherIdxs = shuffle(MATRAS.map((_, i) => i).filter((i) => i !== r.matraIdx));
      const optionIdxs = shuffle([r.matraIdx, ...otherIdxs.slice(0, optionCount - 1)]);

      grid.innerHTML = '';
      optionIdxs.forEach((mIdx, i) => {
        const glyph = r.consonant + MATRAS[mIdx];
        const btn = el('button', 'su-mm-bubble glass-lite relative flex items-center justify-center rounded-full border-2 border-line transition hover:border-saffron') as HTMLButtonElement;
        btn.type = 'button';
        btn.style.aspectRatio = '1';
        btn.style.minHeight = kid ? '120px' : '96px'; // >= 44px; larger in kid mode.
        btn.setAttribute('aria-label', `Letter formed with ${MATRA_NAMES[mIdx]}`);

        const g = el('span', 'gur font-bold text-navy ' + (kid ? 'text-6xl' : 'text-5xl'));
        g.lang = 'pa';
        g.textContent = glyph; // verbatim consonant + matra, both from CONSONANTS/MATRAS above
        btn.appendChild(g);

        if (!reduced) {
          btn.style.animation = `su-mm-float ${(3 + i * 0.3).toFixed(1)}s ease-in-out ${(i * 0.4).toFixed(1)}s infinite alternate`;
        }

        btn.addEventListener('click', () => choose(btn, glyph, answerGlyph));
        grid.appendChild(btn);
      });
    }

    function choose(btn: HTMLButtonElement, picked: string, answer: string): void {
      if (answered) return;
      answered = true;
      const isRight = picked === answer;
      if (isRight) correct++;
      scoreEl.textContent = `Correct: ${correct}`;

      const btns = Array.from(grid.querySelectorAll('button'));
      btns.forEach((b) => {
        (b as HTMLButtonElement).disabled = true;
        b.style.animationPlayState = 'paused';
        const g = b.querySelector('.gur') as HTMLElement | null;
        const glyph = g ? g.textContent : '';
        if (glyph === answer) {
          b.style.boxShadow = '0 0 0 3px rgba(34,153,84,.8)'; // green ring on the correct glyph
          b.style.borderColor = 'transparent';
        } else if (b === btn) {
          b.style.boxShadow = '0 0 0 3px rgba(200,40,40,.75)'; // red ring on a wrong pick
          b.style.borderColor = 'transparent';
        }
      });

      after(reduced ? 500 : 1100, () => {
        round++;
        if (round >= ROUNDS) finish();
        else renderRound();
      });
    }

    function finish(): void {
      const stars = starsFor(correct);
      celebrate(body);
      after(reduced ? 0 : 1100, () => { ctx.onScore(stars); ctx.done(); });
    }

    renderRound();

    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      body.innerHTML = '';
    };
  },
};

// Custom keyframe for the slow bubble float, mirroring akhar-pop's own
// su-ap-float (kept as a separate name so the two games' hoisted <style>
// blocks never collide). The integrator hoists this once per page.
export const GAME_KEYFRAMES = `
@keyframes su-mm-float { from { transform: translateY(0); } to { transform: translateY(-8px); } }
`;
