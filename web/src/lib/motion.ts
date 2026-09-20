// Whisper-quiet motion utilities (DESIGN.md: hover lifts, a gentle staggered
// reveal at most; everything behind prefers-reduced-motion).
//
// Usage: mark elements with class="reveal" (optionally data-reveal-delay="120"
// for a stagger, in ms) and stat counters with data-countup="558" (optional
// data-countup-suffix="+"). initMotion() is called once per page from
// Base.astro; it arms the CSS by stamping data-reveal-ready on <html>, so
// no-JS visitors and crawlers always see un-hidden content.

const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function revealOnScroll(root: ParentNode = document): void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
  if (!els.length) return;
  document.documentElement.setAttribute('data-reveal-ready', '1');
  if (reduced() || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        const delay = parseInt(el.dataset.revealDelay || '0', 10);
        if (delay) el.style.transitionDelay = `${delay}ms`;
        el.classList.add('in');
        io.unobserve(el);
      }
    },
    // threshold MUST be 0: the observer only notifies when the visible
    // FRACTION crosses a listed threshold, and an element taller than several
    // viewports can never reach even 8% visible — with a nonzero threshold it
    // would never reveal at all (this hid whole course pages in production).
    { rootMargin: '0px 0px -8% 0px', threshold: 0 },
  );
  els.forEach((el) => io.observe(el));
}

export function countUp(el: HTMLElement): void {
  const target = parseFloat(el.dataset.countup || '0');
  const suffix = el.dataset.countupSuffix || '';
  const done = () => { el.textContent = `${target.toLocaleString()}${suffix}`; };
  if (reduced() || !Number.isFinite(target) || target <= 0) return done();
  const dur = 1200;
  let start: number | null = null;
  const step = (t: number) => {
    if (start === null) start = t;
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = `${Math.round(target * eased).toLocaleString()}${suffix}`;
    if (p < 1) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}

// 3D tilt for [data-tilt] cards: pointer-tracked, ≤6deg, fine pointers only.
// will-change is applied only while the pointer is over the card (contract).
export function initTilt(root: ParentNode = document): void {
  if (reduced() || !matchMedia('(pointer: fine)').matches) return;
  root.querySelectorAll<HTMLElement>('[data-tilt]').forEach((el) => {
    let raf = 0;
    el.addEventListener('pointerenter', () => { el.style.willChange = 'transform'; });
    el.addEventListener('pointermove', (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`;
      });
    });
    el.addEventListener('pointerleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      el.style.transform = '';
      el.style.willChange = '';
    });
  });
}

// Parallax for hero layers: [data-parallax="0.15"] drifts at that fraction of
// scroll. Desktop + non-reduced only; transform-only, rAF-throttled.
export function initParallax(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
  if (!els.length || reduced() || matchMedia('(max-width: 768px)').matches) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const y = window.scrollY;
    for (const el of els) {
      const f = parseFloat(el.dataset.parallax || '0');
      if (f) el.style.transform = `translate3d(0, ${(y * f).toFixed(1)}px, 0)`;
    }
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

// Progress rings: <svg data-ring><circle class="ring-track"/><circle
// class="ring-value" data-ring-pct="72"/></svg>. The percentage is always
// ALSO rendered as text next to the ring — the sweep is decoration only.
export function initRings(root: ParentNode = document): void {
  const rings = Array.from(root.querySelectorAll<SVGCircleElement>('[data-ring-pct]'));
  if (!rings.length) return;
  const set = (c: SVGCircleElement, animate: boolean) => {
    const pct = Math.max(0, Math.min(100, parseFloat(c.dataset.ringPct || '0')));
    const r = c.r.baseVal.value;
    const circ = 2 * Math.PI * r;
    c.style.strokeDasharray = String(circ);
    if (!animate) { c.style.transition = 'none'; }
    c.style.strokeDashoffset = String(circ * (1 - pct / 100));
  };
  if (reduced() || !('IntersectionObserver' in window)) {
    rings.forEach((c) => set(c, false));
    return;
  }
  rings.forEach((c) => { const r = c.r.baseVal.value; const circ = 2 * Math.PI * r; c.style.strokeDasharray = String(circ); c.style.strokeDashoffset = String(circ); });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      set(e.target as SVGCircleElement, true);
    }
  }, { threshold: 0 });
  rings.forEach((c) => io.observe(c));
}

// Hall arrival: a one-time cinematic entrance for the hero on ambient="hall"
// pages only (index/about/programs) — a hairline curtain sweep, then a
// staggered rise on [data-arrival] children. Content-safe by the same
// contract as revealOnScroll (armed via data-arrival-ready; no-JS/crawlers
// see final state). Scoped to `header [data-arrival]` so it is structurally
// impossible to arrival-gate anything outside a hero, and bails outside hall
// scope entirely (DESIGN.md: never on study/sanctum/reading surfaces).
export function initArrival(): void {
  if (document.body.dataset.ambient !== 'hall') return;
  const els = Array.from(document.querySelectorAll<HTMLElement>('header [data-arrival]'));
  if (!els.length) return;
  document.documentElement.setAttribute('data-arrival-ready', '1');
  if (reduced()) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  // Double rAF: guarantees the browser paints the armed (opacity:0) state
  // before .in is added, so the CSS transition actually plays.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('header .su-arrival-curtain').forEach((c) => c.classList.add('go'));
    els.forEach((el, i) => {
      el.style.transitionDelay = `${i * 90}ms`;
      el.classList.add('in');
    });
  }));
}

// Seal reveal: a drawn-seal stamp-in + one saffron glow pulse, fired AFTER
// the real content/verdict already rendered (never gates it) — cert.astro,
// verify.astro. Same visual language as the games kit's celebrate(), defined
// independently here since this is a shared (non-games) primitive.
// DESIGN.md-sanctioned: no confetti, no emoji, no sound. Skipped under
// reduced motion (the seal is pure decoration; the content beside it already
// says everything that matters).
export function sealReveal(el: HTMLElement): void {
  if (reduced()) return;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

  const wrap = document.createElement('div');
  wrap.className = 'pointer-events-none absolute inset-0 z-20 grid place-items-center';

  const glow = document.createElement('div');
  glow.className = 'absolute h-40 w-40 rounded-full';
  glow.style.background = 'radial-gradient(closest-side, rgba(244,178,26,.55), transparent 70%)';
  glow.style.animation = 'su-seal-glow 900ms var(--ease-out, ease-out) forwards';

  const R = 34, C = 2 * Math.PI * R;
  const seal = document.createElement('div');
  seal.style.animation = 'su-seal-pop 600ms var(--ease-spring, cubic-bezier(.34,1.56,.64,1)) both';
  seal.innerHTML =
    `<svg class="relative h-24 w-24" viewBox="0 0 80 80" fill="none" ` +
    `stroke="#f4b21a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<circle cx="40" cy="40" r="${R}" ` +
    `style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)};` +
    `animation:su-seal-draw 700ms var(--ease-cinema, ease) 120ms forwards"/>` +
    `<path d="M28 41l8 8 16-18" ` +
    `style="stroke-dasharray:44;stroke-dashoffset:44;` +
    `animation:su-seal-draw 420ms var(--ease-cinema, ease) 600ms forwards"/></svg>`;

  wrap.append(glow, seal);
  el.appendChild(wrap);
  window.setTimeout(() => wrap.remove(), 1600);
}

export function initMotion(): void {
  revealOnScroll();
  initTilt();
  initParallax();
  initArrival();
  initRings();
  const counters = Array.from(document.querySelectorAll<HTMLElement>('[data-countup]'));
  if (!counters.length) return;
  if (reduced() || !('IntersectionObserver' in window)) {
    counters.forEach(countUp);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      countUp(e.target as HTMLElement);
    }
  }, { threshold: 0.4 });
  counters.forEach((el) => io.observe(el));
}
