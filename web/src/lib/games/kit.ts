// Shared kit for santhiya mini-games (DESIGN.md: glass + reverent motion).
//
// SITE LAWS honored here:
//  • No emoji (check-no-emoji gate). Icons via ../icons; the close X reuses ICON_ATTRS.
//  • No NEW data-i18n attributes — UI strings stay plain (runtime MT translates them).
//  • ZERO hardcoded Gurmukhi. Every Gurmukhi run is supplied by the caller via `gur`
//    (games copy it verbatim from their own repo sources, e.g. web/src/pages/baal-updesh.astro
//    tables or web/src/lib/santhya.ts). Do NOT add Gurmukhi literals to this file — accuracy is
//    sacred; sourced verbatim copy belongs in the game modules, each with a source comment.
//  • localStorage only under su_v1_games_.  • No inline <script>/handlers (bundled .ts).
//  • prefers-reduced-motion gates every animation.  • Touch targets >= 44px (min-h-11).
import { ICON_ATTRS } from '../icons';

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Progress store (su_v1_games_v1) ────────────────────────────────────────
const PKEY = 'su_v1_games_v1';
const KIDKEY = 'su_v1_games_kid';

type Progress = { stars: Record<string, number>; seals: string[]; streak: number; lastPlay: string };

function readProgress(): Progress {
  const empty: Progress = { stars: {}, seals: [], streak: 0, lastPlay: '' };
  try {
    const raw = localStorage.getItem(PKEY);
    if (!raw) return empty;
    const p = JSON.parse(raw);
    return {
      stars: p && typeof p.stars === 'object' && p.stars ? p.stars : {},
      seals: Array.isArray(p?.seals) ? p.seals : [],
      streak: Number.isFinite(p?.streak) ? p.streak : 0,
      lastPlay: typeof p?.lastPlay === 'string' ? p.lastPlay : '',
    };
  } catch {
    return empty;
  }
}
function writeProgress(p: Progress): void {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {}
}

// Local calendar date, YYYY-MM-DD (not UTC — streaks follow the learner's day).
function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function isYesterday(day: string, today: string): boolean {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return day === localDay(y) && day !== today;
}

export function getStars(gameId: string): number {
  const n = readProgress().stars[gameId];
  return Number.isFinite(n) ? n : 0;
}
export function addStars(gameId: string, n: number): void {
  if (!Number.isFinite(n) || n <= 0) return;
  const p = readProgress();
  p.stars[gameId] = (Number.isFinite(p.stars[gameId]) ? p.stars[gameId] : 0) + Math.floor(n);
  writeProgress(p);
}
export function recordPlay(): void {
  const p = readProgress();
  const today = localDay();
  if (p.lastPlay === today) return;
  p.streak = isYesterday(p.lastPlay, today) ? p.streak + 1 : 1;
  p.lastPlay = today;
  writeProgress(p);
}
export function getStreak(): number {
  const p = readProgress();
  const today = localDay();
  if (p.lastPlay === today || isYesterday(p.lastPlay, today)) return p.streak;
  return 0; // streak has lapsed
}
export function getSeals(): string[] {
  return readProgress().seals.slice();
}
export function awardSeal(id: string): boolean {
  const p = readProgress();
  if (p.seals.includes(id)) return false;
  p.seals.push(id);
  writeProgress(p);
  return true;
}

// ── Leitner card state (su_v1_games_cards) ─────────────────────────────────
// A separate key from PKEY: this is per-card scheduling state (box 0-5, next
// due timestamp), not the aggregate stars/seals/streak progress above. Deck
// scope is the caller's job (e.g. yaad-patte.ts) — this just persists whatever
// card ids that caller uses. Distinct namespace from baal-updesh.astro's own
// su_v1_fc_<hash> keys (its course-term/word deck): a learner's arcade-letter
// recall and their Baal Updesh flashcard progress are intentionally separate
// decks, not merged.
const CARDKEY = 'su_v1_games_cards';
export type CardState = { box: number; due: number };

function readCards(): Record<string, CardState> {
  try {
    const raw = localStorage.getItem(CARDKEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}
export function getCard(id: string): CardState {
  const c = readCards()[id];
  return c && Number.isFinite(c.box) && Number.isFinite(c.due) ? c : { box: 0, due: 0 };
}
export function setCard(id: string, state: CardState): void {
  try {
    const all = readCards();
    all[id] = state;
    localStorage.setItem(CARDKEY, JSON.stringify(all));
  } catch {}
}

// ── Kid mode (su_v1_games_kid) ─────────────────────────────────────────────
export function kidMode(): boolean {
  try { return JSON.parse(localStorage.getItem(KIDKEY) || 'false') === true; } catch { return false; }
}
export function setKidMode(v: boolean): void {
  try { localStorage.setItem(KIDKEY, JSON.stringify(!!v)); } catch {}
}

// ── Overlay: fullscreen liquid-glass game shell ────────────────────────────
export function overlay(opts: { title: string; gur: string }): {
  body: HTMLElement; close(): void; onClose(cb: () => void): void;
} {
  const cbs: Array<() => void> = [];
  const lastFocus = document.activeElement as HTMLElement | null;
  const prevOverflow = document.body.style.overflow;

  const root = document.createElement('div');
  root.className = 'su-game-root fixed inset-0 z-[90] flex items-center justify-center p-4 print:hidden';

  const backdrop = document.createElement('div');
  backdrop.className = 'su-game-backdrop absolute inset-0 bg-black/55';
  root.appendChild(backdrop);

  const panel = document.createElement('div');
  panel.className =
    'su-game-panel glass-strong relative z-10 flex max-h-[92vh] w-[min(92vw,44rem)] flex-col overflow-hidden rounded-xl2 text-ink';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  const titleId = `su-game-title-${Math.random().toString(36).slice(2, 8)}`;
  panel.setAttribute('aria-labelledby', titleId);

  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-3 border-b border-line/60 px-5 py-4';

  const heads = document.createElement('div');
  const title = document.createElement('h2');
  title.id = titleId;
  title.className = 'su-game-title font-serif text-xl font-bold text-navy';
  title.textContent = opts.title; // plain string — runtime MT translates
  const gur = document.createElement('div');
  gur.className = 'su-game-gur gur text-navy';
  gur.lang = 'pa';
  gur.textContent = opts.gur; // caller-supplied verbatim Gurmukhi
  heads.append(title, gur);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className =
    'su-game-close inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl2 border border-line text-navy hover:bg-saffron-soft';
  closeBtn.setAttribute('aria-label', 'Close');
  // No close/X glyph exists in icons.ts — draw one in the shared stroke language.
  closeBtn.innerHTML = `<svg class="h-6 w-6" ${ICON_ATTRS}><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  closeBtn.addEventListener('click', () => close());

  header.append(heads, closeBtn);

  const body = document.createElement('div');
  body.className = 'su-game-body flex-1 overflow-y-auto overscroll-contain p-5';

  panel.append(header, body);
  root.append(panel);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevOverflow;
    root.remove();
    lastFocus?.focus?.();
    cbs.forEach((c) => { try { c(); } catch {} });
  }

  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  closeBtn.focus();

  return { body, close, onClose: (cb: () => void) => { cbs.push(cb); } };
}

// ── Celebration: drawn seal stamp-in + one saffron glow pulse ───────────────
// DESIGN.md-sanctioned: no confetti, no emoji, no sound. Skipped under reduced motion.
export function celebrate(el: HTMLElement, sealId?: string): void {
  if (sealId) awardSeal(sealId); // record even when motion is off (data, not motion)
  if (reduced()) return;

  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

  const wrap = document.createElement('div');
  wrap.className = 'su-game-seal pointer-events-none absolute inset-0 z-20 grid place-items-center';

  const glow = document.createElement('div');
  glow.className = 'su-game-glow absolute h-40 w-40 rounded-full';
  glow.style.background = 'radial-gradient(closest-side, rgba(244,178,26,.55), transparent 70%)';
  glow.style.animation = 'su-game-glow 900ms var(--ease-out, ease-out) forwards';

  const R = 34, C = 2 * Math.PI * R;
  const seal = document.createElement('div');
  seal.style.animation = 'su-game-pop 600ms var(--ease-spring, cubic-bezier(.34,1.56,.64,1)) both';
  seal.innerHTML =
    `<svg class="su-game-seal-svg relative h-24 w-24" viewBox="0 0 80 80" fill="none" ` +
    `stroke="#f4b21a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<circle class="su-game-seal-ring" cx="40" cy="40" r="${R}" ` +
    `style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)};` +
    `animation:su-game-draw 700ms var(--ease-cinema, ease) 120ms forwards"/>` +
    `<path class="su-game-seal-mark" d="M28 41l8 8 16-18" ` +
    `style="stroke-dasharray:44;stroke-dashoffset:44;` +
    `animation:su-game-draw 420ms var(--ease-cinema, ease) 600ms forwards"/></svg>`;

  wrap.append(glow, seal);
  el.appendChild(wrap);
  window.setTimeout(() => wrap.remove(), 1600);
}

// ── Keyframes the kit needs. Integrator hoists this into a <style> once. ─────
// No inline <style> is emitted from JS; animations reference these names via
// element.style.animation. All are frozen by the global reduced-motion switch.
export const KEYFRAMES = `
@keyframes su-game-draw { to { stroke-dashoffset: 0; } }
@keyframes su-game-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes su-game-glow { 0% { opacity: 0; transform: scale(.7); } 45% { opacity: .9; } 100% { opacity: 0; transform: scale(1.25); } }
`;
