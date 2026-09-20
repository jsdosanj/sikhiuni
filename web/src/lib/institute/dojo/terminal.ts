// Vanilla port of sikhi.io components/learn/SikhCodeTerminal.tsx — the
// IDE-style dojo: a file explorer + syntax-highlighted editor that types
// itself out, then "runs" each file in the terminal pane, looping through
// the topic set. A requestAnimationFrame sequencer drives it (anim.ts).
//
// No framework. The shell is built once; each frame updates only the mutable
// regions (editor body, terminal body, status, "now teaching" bar).

import {
  COLORS as C, GLOW, seq, mkRun, norm, stepLive, finalizeLive,
  type Entry, type Run, type StepDef,
} from './anim';

type TokKey = keyof typeof C;
export interface FileDef {
  name: string;
  glyph: string;
  gc: string;
  lang: string;
  outline: [string, string, string][];
  raw: [string, string][][];
  runSteps: StepDef[];
  lineNotes?: Record<string, string>;
}
export interface TerminalConfig {
  headerLabel: string;
  bootSteps: StepDef[];
  files: FileDef[];
  brandLine1: string;
  brandLine2: string;
  brandCaption: string;
  unitLabel?: string;
  reducedMotion?: boolean;
}

interface Line { toks: { c: string; t: string }[]; text: string; len: number; }
interface BuiltFile extends FileDef {
  lines: Line[]; starts: number[]; total: number; flat: string;
  mini: { w: number; c: string }[];
}

function mkFile(def: FileDef): BuiltFile {
  const lines: Line[] = def.raw.map((pairs) => {
    const toks = pairs.map(([key, t]) => ({ c: (C as Record<string, string>)[key] || C.t, t }));
    const text = pairs.map(([, t]) => t).join('');
    return { toks, text, len: text.length };
  });
  const starts: number[] = [];
  let acc = 0;
  lines.forEach((L) => { starts.push(acc); acc += L.len + 1; });
  const flat = lines.map((L) => L.text).join('\n');
  const mini = lines.map((L) => {
    const ft = L.toks.find((tk) => tk.c !== C.t && tk.c !== C.p);
    return { w: Math.max(4, Math.min(60, Math.round(6 + L.len * 1.3))), c: L.len ? (ft ? ft.c : C.d) : 'transparent' };
  });
  return { ...def, lines, starts, total: flat.length, flat, mini };
}

function cutToks(toks: { c: string; t: string }[], count: number) {
  if (count <= 0) return [];
  const out: { c: string; t: string }[] = [];
  let rem = count;
  for (const tk of toks) {
    if (rem <= 0) break;
    if (tk.t.length <= rem) { out.push(tk); rem -= tk.t.length; }
    else { out.push({ c: tk.c, t: tk.t.slice(0, rem) }); rem = 0; }
  }
  return out;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const cursorHtml = '<span class="i-dojo-cur" aria-hidden="true"></span>';

export class SikhCodeTerminal {
  private cfg: TerminalConfig;
  private files: BuiltFile[];
  private st = {
    phase: 'boot' as 'boot' | 'typing' | 'run' | 'rest' | 'idle',
    pt: 0, fileIdx: 0, pos: 0, budget: 0,
    term: [] as Entry[],
    run: null as Run | null,
    playing: true,
    last: 0,
  };
  private raf = 0;
  private root!: HTMLElement;
  private edBody!: HTMLElement;
  private termBody!: HTMLElement;
  private teachBar!: HTMLElement;
  private statusEl!: HTMLElement;
  private counterEl!: HTMLElement;
  private tabWrap!: HTMLElement;
  private mini!: HTMLElement;

  constructor(mount: HTMLElement, cfg: TerminalConfig) {
    this.cfg = cfg;
    this.files = cfg.files.map(mkFile);
    this.buildShell(mount);
    if (cfg.reducedMotion) {
      this.renderStaticFallback();
      return;
    }
    this.st.run = mkRun(seq(cfg.bootSteps));
    this.st.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(60, now - (this.st.last || now));
      this.st.last = now;
      if (this.st.playing && this.advance(dt)) this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this.raf); }

  // ---- static shell -------------------------------------------------------
  private buildShell(mount: HTMLElement) {
    const u = this.cfg.unitLabel || 'Topic';
    mount.innerHTML = `
      <div class="i-dojo i-dojo-term">
        <div class="i-dojo-titlebar">
          <span class="i-dojo-dot" style="background:#FF5F57"></span>
          <span class="i-dojo-dot" style="background:#FEBC2E"></span>
          <span class="i-dojo-dot" style="background:#28C840"></span>
          <span class="i-dojo-title"><span style="color:${C.k};text-shadow:${GLOW}">&#x0A74;</span> ${esc(this.cfg.headerLabel)}</span>
        </div>
        <div class="i-dojo-body">
          <aside class="i-dojo-explorer">
            <div class="i-dojo-exp-h">EXPLORER</div>
            <div class="i-dojo-exp-root">&#9662; SANGAT &mdash; SIKH CODE</div>
            <div class="i-dojo-files"></div>
            <div class="i-dojo-exp-maya">&#9656; maya/ <span>&mdash; do not attach</span></div>
            <div class="i-dojo-exp-h i-dojo-outline-h">OUTLINE</div>
            <div class="i-dojo-outline"></div>
            <div class="i-dojo-brand">
              <div style="color:rgba(240,160,68,0.85)">${esc(this.cfg.brandLine1)}</div>
              <div style="color:#66739A">${esc(this.cfg.brandLine2)}</div>
              <div style="color:#3E4A6E;margin-top:6px;font-size:10px">${esc(this.cfg.brandCaption)}</div>
            </div>
          </aside>
          <div class="i-dojo-main">
            <div class="i-dojo-tabs"></div>
            <div class="i-dojo-breadcrumb">
              <span class="i-dojo-counter"></span>
              <button class="i-dojo-nav" data-nav="-1" aria-label="previous ${u.toLowerCase()}">&#9664;</button>
              <button class="i-dojo-nav" data-nav="1" aria-label="next ${u.toLowerCase()}">&#9654;</button>
              <span class="i-dojo-status"></span>
            </div>
            <div class="i-dojo-teach" hidden></div>
            <div class="i-dojo-editor">
              <span class="i-dojo-watermark" aria-hidden="true">&#x0A74;</span>
              <div class="i-dojo-ed-body"></div>
              <div class="i-dojo-minimap" aria-hidden="true"></div>
            </div>
            <div class="i-dojo-termpane">
              <div class="i-dojo-term-h">
                <span class="i-dojo-term-tab">TERMINAL</span>
                <span class="i-dojo-term-lbl">PROBLEMS <b style="color:#79C98C">0</b></span>
                <button class="i-dojo-term-btn" data-act="playpause" title="pause / play">&#10074;&#10074;</button>
                <button class="i-dojo-term-btn" data-act="clear" title="clear terminal">&#8709;</button>
              </div>
              <div class="i-dojo-term-body"></div>
            </div>
          </div>
        </div>
        <div class="i-dojo-statusbar">
          <span class="i-dojo-sb-gur">&#x0A74;</span>
          <span class="i-dojo-sb-play">&#8734; chardi kala</span>
        </div>
      </div>`;
    this.root = mount.querySelector('.i-dojo')!;
    this.edBody = mount.querySelector('.i-dojo-ed-body')!;
    this.termBody = mount.querySelector('.i-dojo-term-body')!;
    this.teachBar = mount.querySelector('.i-dojo-teach')!;
    this.statusEl = mount.querySelector('.i-dojo-status')!;
    this.counterEl = mount.querySelector('.i-dojo-counter')!;
    this.tabWrap = mount.querySelector('.i-dojo-tabs')!;
    this.mini = mount.querySelector('.i-dojo-minimap')!;

    // file tabs + explorer list
    const fileList = mount.querySelector('.i-dojo-files')!;
    this.files.forEach((f, i) => {
      const row = document.createElement('button');
      row.className = 'i-dojo-file';
      row.innerHTML = `<span style="color:${f.gc}">${esc(f.glyph)}</span> ${esc(f.name)}`;
      row.addEventListener('click', () => this.openFile(i));
      fileList.appendChild(row);

      const tab = document.createElement('button');
      tab.className = 'i-dojo-tab';
      tab.innerHTML = `<span style="color:${f.gc}">${esc(f.glyph)}</span> ${esc(f.name)}`;
      tab.addEventListener('click', () => this.openFile(i));
      this.tabWrap.appendChild(tab);
    });

    mount.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) =>
      b.addEventListener('click', () => this.goToRelative(Number(b.dataset.nav))));
    mount.querySelector('[data-act="playpause"]')!.addEventListener('click', () => {
      this.st.playing = !this.st.playing; this.render();
    });
    mount.querySelector('[data-act="clear"]')!.addEventListener('click', () => {
      this.st.term = []; this.render();
    });
  }

  // ---- sequencer --------------------------------------------------------
  private applyStep(s: StepDef) {
    let e: Partial<Entry> | null = null;
    switch (s.k) {
      case 'cmd': e = { g: '$', gc: C.k, gsh: GLOW, txt: '', tc: C.t, fw: 600, cur: true }; break;
      case 'out': e = { txt: s.t, tc: C.t }; break;
      case 'dim': e = { txt: s.t, tc: C.d }; break;
      case 'ok': e = { g: '+', gc: '#79C98C', txt: s.t, tc: C.t }; break;
      case 'warn': e = { g: '!', gc: '#E8B34B', txt: s.t, tc: C.d }; break;
      case 'svc': e = { g: '●', gc: '#79C98C', txt: s.t, tc: C.t }; break;
      case 'add': e = { g: '+', gc: C.s, txt: s.t, tc: C.t }; break;
      case 'inf': e = { g: '∞', gc: C.k, gsh: GLOW, txt: s.t, tc: C.k }; break;
      case 'gur': e = { g: 'ੴ', gc: C.g, gsh: GLOW, txt: s.t, tc: C.g, fw: 600 }; break;
      case 'spin': e = { g: '⠋', gc: C.k, txt: s.t, tc: C.d }; break;
      case 'bar': e = { txt: s.t, tc: C.d, bar: true }; break;
      case 'blank': e = { txt: ' ', tc: C.d }; break;
    }
    if (!e) return;
    const entry = norm(e);
    if (s.k === 'cmd' || s.k === 'spin' || s.k === 'bar') this.st.run!.live.push({ s: s as never, e: entry });
    this.st.term.push(entry);
    if (this.st.term.length > 140) this.st.term = this.st.term.slice(-90);
  }

  private beginTyping(i: number) {
    this.st.fileIdx = i; this.st.pos = 0; this.st.budget = 0; this.st.phase = 'typing';
  }

  private nextFile() {
    let n = this.st.fileIdx + 1;
    if (n >= this.files.length) n = 0;
    this.beginTyping(n);
  }

  private goToRelative(delta: number) {
    this.openFile((this.st.fileIdx + delta + this.files.length) % this.files.length);
  }

  private openFile(i: number) {
    if (this.st.run) finalizeLive(this.st.run);
    this.st.run = null;
    this.st.fileIdx = i; this.st.pos = 0; this.st.budget = 0; this.st.phase = 'typing'; this.st.pt = 0;
    this.st.term.push(norm({ g: '›', gc: C.d, txt: 'open ' + this.files[i].name, tc: C.d }));
    this.st.playing = true;
    this.render();
  }

  private advance(dt: number): boolean {
    const st = this.st;
    switch (st.phase) {
      case 'boot':
      case 'run': {
        const r = st.run!;
        const changed = stepLive(r, dt);
        let structural = false;
        while (r.i < r.steps.length && r.t >= r.steps[r.i].at) { this.applyStep(r.steps[r.i]); r.i++; structural = true; }
        if (r.i >= r.steps.length && !r.live.length && r.t >= r.end) {
          st.run = null;
          if (st.phase === 'boot') this.beginTyping(0);
          else { st.phase = 'rest'; st.pt = 0; }
        }
        return changed || structural;
      }
      case 'typing': {
        const F = this.files[st.fileIdx];
        st.budget += 95 * dt / 1000;
        while (st.pos < F.flat.length) {
          const ch = F.flat[st.pos];
          const cost = ch === '\n' ? 3.4 : (ch === ' ' ? 0.55 : 1);
          if (st.budget >= cost) { st.budget -= cost; st.pos++; } else break;
        }
        if (st.pos >= F.flat.length) { st.phase = 'run'; st.run = mkRun(seq(F.runSteps)); }
        return true;
      }
      case 'rest':
        st.pt += dt;
        if (st.pt >= 1800) { this.nextFile(); return true; }
        return false;
      default:
        return false;
    }
  }

  // ---- render (mutable regions only) -----------------------------------
  private render() {
    const st = this.st;
    const F = this.files[st.fileIdx];

    // editor lines
    let curLine = 0;
    const rows: string[] = [];
    for (let i = 0; i < F.lines.length; i++) {
      const start = F.starts[i], L = F.lines[i];
      if (st.pos > start + L.len) {
        rows.push(this.lineHtml(i + 1, L.toks, false, false));
      } else if (st.pos >= start) {
        rows.push(this.lineHtml(i + 1, cutToks(L.toks, st.pos - start), true, true));
        curLine = i;
        break;
      }
    }
    this.edBody.innerHTML = rows.join('');

    // minimap
    this.mini.innerHTML = F.mini
      .map((m, i) => `<span style="width:${m.w}px;background:${m.c};opacity:${i <= curLine ? 0.95 : 0.25}"></span>`)
      .join('');

    // "now teaching"
    let note: string | null = null;
    if (F.lineNotes) {
      for (let i = curLine; i >= 0; i--) {
        if (F.lineNotes[String(i)]) { note = F.lineNotes[String(i)]; break; }
      }
    }
    if (note) {
      this.teachBar.hidden = false;
      this.teachBar.innerHTML = `<span class="i-dojo-teach-lbl">now teaching</span><span>${esc(note)}</span>`;
    } else {
      this.teachBar.hidden = true;
    }

    // terminal body
    this.termBody.innerHTML = st.term.map((e) => this.entryHtml(e)).join('');
    this.termBody.scrollTop = this.termBody.scrollHeight;

    // tabs active state
    this.tabWrap.querySelectorAll('.i-dojo-tab').forEach((el, i) =>
      el.classList.toggle('active', i === st.fileIdx));

    // outline
    const outline = this.root.querySelector('.i-dojo-outline')!;
    outline.innerHTML = F.outline
      .map((o) => `<div><span style="color:${o[2]}">${esc(o[0])}</span> ${esc(o[1])}</div>`)
      .join('');

    // counter + status
    const u = this.cfg.unitLabel || 'Topic';
    this.counterEl.textContent = `${u} ${st.fileIdx + 1} of ${this.files.length}`;
    let label = '', col = C.k;
    if (!st.playing) { label = 'paused'; col = '#E8B34B'; }
    else if (st.phase === 'typing') { label = `typing — ${Math.round(st.pos / F.total * 100)}%`; col = C.k; }
    else if (st.phase === 'boot' || st.phase === 'run') { label = 'executing'; col = '#79C98C'; }
    else if (st.phase === 'rest') { label = 'saved — ਸਹਿਜ'; col = '#79C98C'; }
    else { label = 'complete'; col = C.k; }
    this.statusEl.textContent = label;
    this.statusEl.style.color = col;

    this.root.querySelector<HTMLElement>('[data-act="playpause"]')!.innerHTML = st.playing ? '&#10074;&#10074;' : '&#9654;';
  }

  private lineHtml(n: number, toks: { c: string; t: string }[], active: boolean, cur: boolean) {
    const body = toks.map((tk) => `<span style="color:${tk.c}">${esc(tk.t)}</span>`).join('');
    return `<div class="i-dojo-ln${active ? ' active' : ''}"><span class="i-dojo-ln-n">${n}</span><span class="i-dojo-ln-c">${body}${cur ? cursorHtml : ''}</span></div>`;
  }

  private entryHtml(e: Entry) {
    const bar = e.bar
      ? `<span class="i-dojo-bar"><span style="width:${e.pctW}"></span></span><span class="i-dojo-bar-t">${e.pctText}</span>`
      : '';
    return `<div class="i-dojo-row"><span class="i-dojo-g" style="color:${e.gc};text-shadow:${e.gsh}">${esc(e.g)}</span><span class="i-dojo-tx" style="color:${e.tc};font-weight:${e.fw}">${esc(e.txt)}</span>${e.cur ? cursorHtml : ''}${bar}</div>`;
  }

  // ---- reduced-motion: show the last file fully typed + its run output ----
  private renderStaticFallback() {
    const F = this.files[0];
    this.edBody.innerHTML = F.lines
      .map((L, i) => this.lineHtml(i + 1, L.toks, false, false))
      .join('');
    const r = mkRun(seq(F.runSteps));
    while (r.i < r.steps.length) { this.applyStep(r.steps[r.i]); r.i++; }
    finalizeLive(r);
    this.termBody.innerHTML = this.st.term.map((e) => this.entryHtml(e)).join('');
    this.counterEl.textContent = `${this.cfg.unitLabel || 'Topic'} 1 of ${this.files.length}`;
    this.statusEl.textContent = 'reduced motion — static preview';
    this.tabWrap.querySelector('.i-dojo-tab')?.classList.add('active');
    const outline = this.root.querySelector('.i-dojo-outline')!;
    outline.innerHTML = F.outline.map((o) => `<div><span style="color:${o[2]}">${esc(o[0])}</span> ${esc(o[1])}</div>`).join('');
  }
}
