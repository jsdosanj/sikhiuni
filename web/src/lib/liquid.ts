// Liquid shell behaviour: the pointer sheen on glass, the compact title in the
// narrow top bar, keyboard shortcuts on wide screens, and the small progress
// marks on catalogue rows. Everything here is an enhancement: every page
// reads and navigates without it. See DESIGN-LIQUID.md.
import { doneList } from './path';

const P = 'su_v1_';
export const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(P + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

/** The specular sheen follows the pointer through two CSS variables: no layout, no re-render. */
function initSheen() {
  if (!matchMedia('(pointer: fine)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const el = (e.target as Element | null)?.closest?.('.lq-glass--sheen') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--lq-mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--lq-my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

/** Narrow screens: once the page's large title has scrolled under the bar, the bar carries it. */
function initCompactTitle() {
  const nav = document.querySelector('.su-nav');
  const slot = document.getElementById('lq-nav-title');
  const h1 = document.querySelector('main h1');
  if (!nav || !slot || !h1 || typeof IntersectionObserver === 'undefined') return;
  slot.textContent = (h1.textContent || '').replace(/\s+/g, ' ').trim();
  new IntersectionObserver(([entry]) => {
    nav.toggleAttribute('data-titled', !entry.isIntersecting && entry.boundingClientRect.top < 80);
  }, { rootMargin: '-72px 0px 0px 0px' }).observe(h1);
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function initKeys() {
  const help = document.getElementById('lq-keys');
  let returnTo: HTMLElement | null = null;
  const show = (on: boolean) => {
    if (!help) return;
    if (on) returnTo = document.activeElement as HTMLElement | null;
    help.hidden = !on;
    if (on) (help.querySelector('[data-lq-keys-close]') as HTMLElement | null)?.focus();
    else returnTo?.focus();
  };
  document.querySelectorAll('[data-lq-keys]').forEach((b) => b.addEventListener('click', () => show(true)));
  help?.addEventListener('click', (e) => { if (e.target === help || (e.target as Element).closest('[data-lq-keys-close]')) show(false); });

  const go: Record<string, string> = { h: '/', p: '/dashboard', c: '/catalog', d: '/departments', s: '/santhiya' };
  let armed = 0;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && help && !help.hidden) { show(false); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    const cmdk = document.getElementById('su-cmdk');
    if (cmdk && !cmdk.hidden) return;
    const k = e.key.toLowerCase();
    if (e.key === '?') { e.preventDefault(); show(true); return; }
    if (armed && Date.now() - armed < 1200 && go[k]) { armed = 0; location.href = go[k]; return; }
    armed = k === 'g' ? Date.now() : 0;
    // Course page: J and K step through the lessons.
    if (k === 'j' || k === 'k') stepLesson(k === 'j' ? 1 : -1);
  });
}

// ── Course page: where am I, next and previous ─────────────────────────────

const lessons = () => Array.from(document.querySelectorAll<HTMLElement>('article[id^="lesson-"]'));

/** The lesson whose top is nearest above the reading line. */
function currentLesson(list = lessons()): number {
  let at = 0;
  list.forEach((el, i) => { if (el.getBoundingClientRect().top < innerHeight * 0.4) at = i; });
  return at;
}

function stepLesson(dir: 1 | -1) {
  const list = lessons();
  if (!list.length) return;
  const next = Math.max(0, Math.min(list.length - 1, currentLesson(list) + dir));
  list[next].scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/** Narrow screens: a dock with the lesson you are in, previous and next. Swipe it sideways to move. */
function initLessonDock() {
  const dock = document.getElementById('lq-dock');
  const list = lessons();
  if (!dock || !list.length) return;
  const label = dock.querySelector('small')!, title = dock.querySelector('b')!;
  const [prev, next] = Array.from(dock.querySelectorAll('button'));
  // <main> runs an entrance animation on transform, which would make it the
  // containing block for a fixed child. The dock belongs to the viewport.
  document.body.appendChild(dock);
  dock.hidden = false;
  document.body.classList.add('lq-has-dock');
  let raf = 0;
  const sync = () => {
    raf = 0;
    const i = currentLesson(list);
    label.textContent = `Lesson ${i + 1} of ${list.length}`;
    title.textContent = list[i].querySelector('h3')?.textContent?.trim() || '';
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
    // Out of the way above the first lesson and below the last.
    const top = list[0].getBoundingClientRect().top, bottom = list[list.length - 1].getBoundingClientRect().bottom;
    dock.toggleAttribute('data-away', top > innerHeight * 0.8 || bottom < innerHeight * 0.3);
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(sync); }, { passive: true });
  prev.addEventListener('click', () => stepLesson(-1));
  next.addEventListener('click', () => stepLesson(1));
  let x0 = 0, y0 = 0;
  dock.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  dock.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) stepLesson(dx < 0 ? 1 : -1);
  }, { passive: true });
  sync();
}

// ── Catalogue: progress on the rows the learner has begun ──────────────────

function initCatalogueProgress() {
  const rows = document.querySelectorAll<HTMLAnchorElement>('a.cat-item[href^="/course/"]');
  if (!rows.length) return;
  rows.forEach((row) => {
    const id = row.getAttribute('href')!.slice('/course/'.length);
    const total = Number(row.dataset.lessons) || 0;
    const passed = !!store.get('passed_' + id, false);
    const done = doneList(store.get('done_' + id, {}), total).length;
    if (!passed && !done) return;
    const pct = passed ? 100 : total ? Math.round((done / total) * 100) : 0;
    row.dataset.lqPct = String(pct);
    row.style.setProperty('--lq-pct', pct + '%');
    const chip = document.createElement('span');
    chip.className = 'lq-cat-status';
    chip.dataset.state = passed ? 'complete' : 'started';
    chip.textContent = passed ? 'Complete' : `${done} of ${total} lessons`;
    row.querySelector('.cat-course-end')?.prepend(chip);
  });
  // /catalog?topic=<id> opens with that subject selected (used by My path).
  const topic = new URLSearchParams(location.search).get('topic');
  if (topic) (document.querySelector(`#cat-filters [data-t="${CSS.escape(topic)}"]`) as HTMLElement | null)?.click();
}

export function initLiquid() {
  initSheen();
  initCompactTitle();
  initKeys();
  initLessonDock();
  initCatalogueProgress();
}
