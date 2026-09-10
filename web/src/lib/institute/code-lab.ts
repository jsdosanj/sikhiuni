// The Code Lab client controller. One instance per `.i-lab` on the page.
//
// Panes:
//   editor   — a plain <textarea> (E1: lean, not CodeMirror). Tab inserts 2
//              spaces; the buffer autosaves to localStorage per lesson (X6).
//   preview  — a sandboxed srcdoc <iframe> for lang="html" (allow-scripts only,
//              never allow-same-origin — that pair defeats the sandbox).
//   console  — captured console.* / errors, from the runner worker and the
//              preview iframe's postMessage shim.
//   checks   — pass/fail list from the worker's check-runner. All green after a
//              Run posts { done: true } to /api/progress (client-attested, B).
//
// Mobile (< 760px, D5): the panes stack — editor on top, Preview + Console as
// <details>, Run fixed to the bottom. Driven by CSS; no JS branch here.

import type { Check, RunOutcome } from './check-runner';

type Lang = 'js' | 'html' | 'py';

interface LabConfig {
  id: string;
  lang: Lang;
  starter: string;
  checks: Check[];
  solution?: string;
  /** Track id — the `course_id` this lab's completion is recorded under. */
  track?: string;
  /** The lesson's index within its track: /api/progress wants an integer. */
  lessonIndex?: number;
}

const RUN_TIMEOUT_MS = 10_000;
// Python's first Run downloads Pyodide (~6 MB wasm + stdlib) from jsDelivr;
// give it room. The worker is kept alive between Runs so later Runs are fast.
const PY_TIMEOUT_MS = 45_000;
const bufKey = (id: string) => `iot_v1_buf_${id}`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

class CodeLab {
  el: HTMLElement;
  cfg: LabConfig;
  ta: HTMLTextAreaElement;
  runBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement | null;
  solBtn: HTMLButtonElement | null;
  consoleEl: HTMLElement;
  checksEl: HTMLElement;
  previewFrame: HTMLIFrameElement | null;
  worker: Worker | null = null;
  pyWorker: Worker | null = null; // kept alive between Runs (Pyodide stays loaded)
  timer: number | null = null;
  fails = 0;

  constructor(el: HTMLElement) {
    this.el = el;
    this.cfg = JSON.parse(el.querySelector<HTMLScriptElement>('script.i-lab-cfg')!.textContent || '{}');
    this.ta = el.querySelector('textarea.i-lab-code')!;
    this.runBtn = el.querySelector('.i-lab-run')!;
    this.resetBtn = el.querySelector('.i-lab-reset');
    this.solBtn = el.querySelector('.i-lab-solution');
    this.consoleEl = el.querySelector('.i-lab-console')!;
    this.checksEl = el.querySelector('.i-lab-checks')!;
    this.previewFrame = el.querySelector('iframe.i-lab-preview');

    let saved: string | null = null;
    try { saved = localStorage.getItem(bufKey(this.cfg.id)); } catch { /* private mode */ }
    this.ta.value = saved ?? this.cfg.starter;

    this.ta.addEventListener('input', () => this.onEdit());
    this.ta.addEventListener('keydown', (e) => this.onKey(e));
    this.runBtn.addEventListener('click', () => this.run());
    this.resetBtn?.addEventListener('click', () => this.reset());
    this.solBtn?.addEventListener('click', () => this.reveal());

    window.addEventListener('message', (e) => this.onFrameMessage(e));

    if (this.cfg.lang === 'html') this.renderPreview();
  }

  onEdit() {
    try { localStorage.setItem(bufKey(this.cfg.id), this.ta.value); } catch { /* ignore */ }
    if (this.cfg.lang === 'html') {
      clearTimeout(this.timer ?? undefined);
      this.timer = window.setTimeout(() => this.renderPreview(), 350);
    }
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = this.ta.selectionStart, en = this.ta.selectionEnd;
      this.ta.value = this.ta.value.slice(0, s) + '  ' + this.ta.value.slice(en);
      this.ta.selectionStart = this.ta.selectionEnd = s + 2;
      this.onEdit();
    }
  }

  reset() {
    this.ta.value = this.cfg.starter;
    this.onEdit();
    this.consoleEl.textContent = '';
    this.checksEl.textContent = '';
    if (this.cfg.lang === 'html') this.renderPreview();
    this.ta.focus();
  }

  reveal() {
    if (!this.cfg.solution) return;
    this.ta.value = this.cfg.solution;
    this.onEdit();
    if (this.cfg.lang === 'html') this.renderPreview();
  }

  logLine(level: string, text: string) {
    const div = document.createElement('div');
    div.className = 'i-lab-cline i-lab-' + level;
    div.textContent = text;
    this.consoleEl.appendChild(div);
    this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
  }

  // ---- HTML preview (sandboxed iframe) --------------------------------------
  // The learner's HTML/JS runs inside <iframe sandbox="allow-scripts"> (never
  // allow-same-origin — that pair defeats the sandbox). A shim we prepend to the
  // srcdoc mirrors console.* back to the parent AND, on DOMContentLoaded, runs
  // the checks in the iframe's own global scope (where the learner's functions
  // and the real DOM live) and posts the results back. The parent can't read
  // into the sandboxed frame, so everything crosses by postMessage.
  renderPreview(runChecksToo = false) {
    if (!this.previewFrame) return;
    const checksJson = runChecksToo ? JSON.stringify(this.cfg.checks) : '[]';
    const shim =
      `<script>(function(){` +
      `var p=function(m){parent.postMessage(Object.assign({__iLab:1},m),'*')};` +
      `var fmt=function(a){return Array.prototype.map.call(a,function(x){return typeof x==='string'?x:JSON.stringify(x)}).join(' ')};` +
      `['log','warn','error','info'].forEach(function(l){var o=console[l];console[l]=function(){o.apply(console,arguments);p({type:'log',level:l==='info'?'log':l,text:fmt(arguments)})}});` +
      `window.onerror=function(m){p({type:'log',level:'error',text:String(m)})};` +
      `document.addEventListener('DOMContentLoaded',function(){` +
      `var C=${checksJson};if(!C.length)return;` +
      `var r=C.map(function(c,i){try{return{i:i,pass:Boolean((new Function(c.test))())}}catch(e){return{i:i,pass:false,error:(e&&e.message)||String(e)}}});` +
      `p({type:'checks',raw:r})` +
      `})})();<\/script>`;
    this.previewFrame.srcdoc = shim + this.ta.value;
  }

  onFrameMessage(e: MessageEvent) {
    const d = e.data;
    if (!d || d.__iLab !== 1) return;
    if (d.type === 'log') this.logLine(d.level, d.text);
    else if (d.type === 'checks') {
      const raw: { i: number; pass: boolean; error?: string }[] = d.raw || [];
      const results = this.cfg.checks.map((c, i) => {
        const x = raw.find((r) => r.i === i);
        return { name: c.name, hint: c.hint, pass: x ? x.pass : false, error: x?.error };
      });
      this.renderChecks({ ran: true, results, complete: results.length > 0 && results.every((r) => r.pass) });
    }
  }

  // ---- Run --------------------------------------------------------------------
  //   HTML: re-render the sandboxed preview; its shim runs the checks in the
  //         iframe's own DOM scope and posts results back (onFrameMessage).
  //   JS:   run in the terminated-on-timeout Web Worker.
  run() {
    this.consoleEl.textContent = '';
    this.checksEl.innerHTML = '<span class="i-lab-running">running…</span>';
    this.runBtn.disabled = true;

    if (this.cfg.lang === 'html') {
      this.renderPreview(true);
      // Re-enable Run shortly after; the shim posts checks on DOMContentLoaded.
      window.setTimeout(() => { this.runBtn.disabled = false; }, 600);
      return;
    }

    if (this.cfg.lang === 'py') { this.runPy(); return; }

    this.worker?.terminate();
    this.worker = new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' });
    this.timer = window.setTimeout(() => {
      this.worker?.terminate();
      this.worker = null;
      this.runBtn.disabled = false;
      this.logLine('error', 'still running after 10s — stopped it. An infinite loop?');
      this.checksEl.innerHTML = '<span class="i-lab-cross">timed out</span>';
    }, RUN_TIMEOUT_MS);

    this.worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === 'log') this.logLine(m.level, m.text);
      else if (m.type === 'result') {
        clearTimeout(this.timer ?? undefined);
        this.worker?.terminate();
        this.worker = null;
        this.runBtn.disabled = false;
        this.renderChecks(m.outcome as RunOutcome);
      }
    };
    this.worker.onerror = () => {
      clearTimeout(this.timer ?? undefined);
      this.runBtn.disabled = false;
      this.logLine('error', 'the runner could not start — try Run again');
      this.checksEl.textContent = '';
    };

    const code = this.cfg.lang === 'html'
      ? extractScript(this.ta.value)   // checks for an HTML lesson run against its <script>
      : this.ta.value;
    this.worker.postMessage({ code, checks: this.cfg.checks });
  }

  // ---- Python (Pyodide worker, kept alive between Runs) -------------------
  runPy() {
    if (!this.pyWorker) {
      this.pyWorker = new Worker(new URL('./lab-python.worker.ts', import.meta.url), { type: 'module' });
      this.pyWorker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'status') {
          this.checksEl.innerHTML = `<span class="i-lab-running">${esc(m.text)}</span>`;
        } else if (m.type === 'log') {
          this.logLine(m.level, m.text);
        } else if (m.type === 'result') {
          clearTimeout(this.timer ?? undefined);
          this.runBtn.disabled = false;
          this.renderChecks(m.outcome as RunOutcome);
        }
      };
      this.pyWorker.onerror = () => {
        clearTimeout(this.timer ?? undefined);
        this.pyWorker?.terminate();
        this.pyWorker = null;
        this.runBtn.disabled = false;
        this.logLine('error', 'the Python runner could not start — try Run again');
        this.checksEl.textContent = '';
      };
    }

    this.timer = window.setTimeout(() => {
      // A hang (infinite loop, or a stalled download): kill the worker so the
      // next Run rebuilds it from scratch.
      this.pyWorker?.terminate();
      this.pyWorker = null;
      this.runBtn.disabled = false;
      this.logLine('error', 'still running after 45s — stopped it. An infinite loop, or a slow connection?');
      this.checksEl.innerHTML = '<span class="i-lab-cross">timed out</span>';
    }, PY_TIMEOUT_MS);

    this.pyWorker.postMessage({ code: this.ta.value, checks: this.cfg.checks });
  }

  renderChecks(o: RunOutcome) {
    if (o.runError) this.logLine('error', o.runError);
    if (!this.cfg.checks.length) { this.checksEl.textContent = ''; return; }

    const rows = o.results.map((r) => {
      // The pass/fail marks are CSS-drawn (.i-lab-tick / .i-lab-cross ::before) —
      // no unicode glyph in the source (DESIGN.md emoji-ban gate).
      const glyph = `<span class="i-lab-mark ${r.pass ? 'i-lab-tick' : 'i-lab-cross'}" aria-hidden="true"></span>`;
      const hint = !r.pass && (this.fails >= 2 || r.error)
        ? `<span class="i-lab-hint"> — ${esc(r.hint || r.error || '')}</span>` : '';
      return `<div class="i-lab-crow">${glyph} ${esc(r.name)}${hint}</div>`;
    }).join('');
    this.checksEl.innerHTML = rows;

    if (o.complete) {
      this.fails = 0;
      this.checksEl.insertAdjacentHTML('beforeend',
        '<div class="i-lab-done">you wrote and ran a real program.</div>');
      this.markDone();
    } else {
      this.fails += 1;
      if (this.cfg.solution && this.fails >= 3 && !this.solBtn?.dataset.shown) {
        this.solBtn?.removeAttribute('hidden');
        if (this.solBtn) this.solBtn.dataset.shown = '1';
      }
    }
  }

  markDone() {
    // Client-attested completion (model B). No score is sent — the gradebook
    // treats a lab check-pass exactly like a lesson "done" flag.
    //
    // This used to post { courseId, lessonId: '<track>::<slug>::lab', done: true }
    // and /api/progress rejected every one of them with a 400: it requires an
    // INTEGER lessonId and a boolean named `completed`, not `done`. fetch does
    // not reject on 4xx and the .catch() below only sees network errors, so
    // every institute lab completion was discarded in silence — nothing ever
    // reached the dashboard or the gradebook. The track and the lesson's index
    // are now passed in explicitly rather than parsed back out of the lab id,
    // whose shape is a localStorage key, not an API contract.
    const { track, lessonIndex } = this.cfg;
    if (track && Number.isInteger(lessonIndex)) {
      fetch('/api/progress', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: track, lessonId: lessonIndex, completed: true }),
      }).catch(() => { /* progress sync is best-effort; localStorage is the cache */ });
    }
    try {
      const k = 'iot_v1_lab_done';
      const set = new Set(JSON.parse(localStorage.getItem(k) || '[]'));
      set.add(this.cfg.id);
      localStorage.setItem(k, JSON.stringify([...set]));
    } catch { /* ignore */ }
  }
}

/** Pull the contents of the first <script> in an HTML doc (for HTML-lesson checks). */
function extractScript(html: string): string {
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  return m ? m[1] : '';
}

export function initCodeLabs() {
  document.querySelectorAll<HTMLElement>('.i-lab').forEach((el) => {
    if (!el.dataset.init) { el.dataset.init = '1'; new CodeLab(el); }
  });
}
