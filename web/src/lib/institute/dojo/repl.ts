// Vanilla port of sikhi.io components/learn/SikhCodeDojo.tsx — the CLI dojo:
// a single-pane REPL that teaches its command set through a scripted typing
// demo, and lets a visitor drive it themselves (type `/`, arrow through,
// tab-complete, enter). rAF sequencer from anim.ts.

import {
  COLORS as C, GLOW, seq, mkRun, norm, stepLive, finalizeLive,
  type Entry, type Run, type StepDef,
} from './anim';

export interface DojoCommand {
  cmd: string;
  desc: string;
  special?: 'clear';
  steps?: StepDef[];
}
export interface ReplConfig {
  headerLabel: string;
  welcomeTitle: string;
  welcomeLines: string[];
  footnote?: string;
  commands: DojoCommand[];
  demoList?: string[];
  modelLabel?: string;
  reducedMotion?: boolean;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const cursorHtml = '<span class="i-dojo-cur" aria-hidden="true"></span>';

export class SikhCodeRepl {
  private cfg: ReplConfig;
  private cmds: DojoCommand[];
  private demoSeq: string[];
  private st = {
    entries: [] as Entry[],
    run: null as Run | null,
    phase: 'idle' as 'idle' | 'run',
    inputVal: '',
    menuSel: 0,
    suppressVal: null as string | null,
    ctx: 7,
    demo: true,
    demoSt: { mode: 'pause' as 'pause' | 'typing', t: 0, i: 0, first: true },
    last: 0,
  };
  private raf = 0;
  private root!: HTMLElement;
  private scrollEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private ghostEl!: HTMLElement;
  private menuEl!: HTMLElement;
  private ctxEl!: HTMLElement;
  private demoEl!: HTMLElement;

  constructor(mount: HTMLElement, cfg: ReplConfig) {
    this.cfg = cfg;
    this.cmds = cfg.commands;
    this.demoSeq = cfg.demoList || this.cmds.filter((c) => !c.special).map((c) => c.cmd);
    this.buildShell(mount);
    if (cfg.reducedMotion) {
      this.st.demo = false;
      this.runStatic();
      return;
    }
    this.st.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(60, now - (this.st.last || now));
      this.st.last = now;
      if (this.advance(dt)) this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this.raf); }

  private buildShell(mount: HTMLElement) {
    const chips = ['/help', this.cmds[1]?.cmd, this.cmds[2]?.cmd, this.cmds[3]?.cmd].filter(Boolean) as string[];
    mount.innerHTML = `
      <div class="i-dojo i-dojo-repl">
        <div class="i-dojo-titlebar">
          <span class="i-dojo-dot" style="background:#FF5F57"></span>
          <span class="i-dojo-dot" style="background:#FEBC2E"></span>
          <span class="i-dojo-dot" style="background:#28C840"></span>
          <span class="i-dojo-title"><span style="color:${C.k};text-shadow:${GLOW}">&#x0A74;</span> ${esc(this.cfg.headerLabel)}</span>
        </div>
        <div class="i-dojo-scroll">
          <div class="i-dojo-scroll-in">
            <div class="i-dojo-welcome">
              <div class="i-dojo-welcome-h"><span style="color:${C.k};text-shadow:${GLOW}">&#x0A74;</span> ${esc(this.cfg.welcomeTitle)}</div>
              ${this.cfg.welcomeLines.map((l) => `<div class="i-dojo-welcome-l">${esc(l)}</div>`).join('')}
            </div>
            ${this.cfg.footnote ? `<div class="i-dojo-footnote">${esc(this.cfg.footnote)}</div>` : ''}
            <div class="i-dojo-entries"></div>
          </div>
        </div>
        <div class="i-dojo-inputbar">
          <div class="i-dojo-menu" hidden></div>
          <div class="i-dojo-scroll-in">
            <div class="i-dojo-chips">
              ${chips.map((c) => `<button class="i-dojo-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}
            </div>
            <div class="i-dojo-inputrow">
              <span style="color:${C.k};text-shadow:${GLOW};font-weight:700">&#8250;</span>
              <span class="i-dojo-ghost"></span>${cursorHtml}
              <span class="i-dojo-placeholder">try /help &middot; or describe a task — tab completes, enter runs</span>
              <input class="i-dojo-input" spellcheck="false" autocomplete="off" aria-label="dojo command input" />
            </div>
          </div>
        </div>
        <div class="i-dojo-statusbar i-dojo-repl-sb">
          <span class="i-dojo-sb-gur">&#x0A74;</span>
          <span class="i-dojo-sb-hint">type / for commands &middot; tab completes &middot; esc dismisses</span>
          <span class="i-dojo-sb-spacer"></span>
          <span class="i-dojo-sb-model">model: ${esc(this.cfg.modelLabel || 'sikh-1 (chardi-kala)')}</span>
          <span class="i-dojo-sb-ctx">context: 7%</span>
          <span class="i-dojo-sb-demo">demo — press any key to drive</span>
        </div>
      </div>`;
    this.root = mount.querySelector('.i-dojo')!;
    this.scrollEl = mount.querySelector('.i-dojo-scroll')!;
    this.bodyEl = mount.querySelector('.i-dojo-entries')!;
    this.inputEl = mount.querySelector('.i-dojo-input')!;
    this.ghostEl = mount.querySelector('.i-dojo-ghost')!;
    this.menuEl = mount.querySelector('.i-dojo-menu')!;
    this.ctxEl = mount.querySelector('.i-dojo-sb-ctx')!;
    this.demoEl = mount.querySelector('.i-dojo-sb-demo')!;

    this.scrollEl.addEventListener('click', () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      this.inputEl.focus();
    });
    mount.querySelectorAll<HTMLButtonElement>('[data-chip]').forEach((b) =>
      b.addEventListener('click', () => { this.demoStop(); this.submit(b.dataset.chip!); this.render(); }));

    this.inputEl.addEventListener('input', () => {
      this.demoStop();
      this.st.inputVal = this.inputEl.value;
      this.st.suppressVal = null; this.st.menuSel = 0;
      this.render();
    });
    this.inputEl.addEventListener('keydown', (ev) => this.onKey(ev));
  }

  private onKey(ev: KeyboardEvent) {
    const items = this.getMenu();
    if (ev.key === 'ArrowDown' && items.length) { ev.preventDefault(); this.st.menuSel = (this.st.menuSel + 1) % items.length; this.render(); return; }
    if (ev.key === 'ArrowUp' && items.length) { ev.preventDefault(); this.st.menuSel = (this.st.menuSel - 1 + items.length) % items.length; this.render(); return; }
    if (ev.key === 'Tab' && items.length) { ev.preventDefault(); this.demoStop(); this.setInput(items[this.st.menuSel].cmd); return; }
    if (ev.key === 'Escape') { this.st.suppressVal = this.st.inputVal; this.render(); return; }
    if (ev.key === 'Enter') {
      ev.preventDefault(); this.demoStop();
      if (items.length && this.st.inputVal.indexOf(' ') < 0 && this.st.inputVal !== items[this.st.menuSel].cmd) this.submit(items[this.st.menuSel].cmd);
      else this.submit(this.st.inputVal);
      this.render(); return;
    }
    if (ev.key.length === 1) this.demoStop();
  }

  private setInput(v: string) {
    this.st.inputVal = v; this.inputEl.value = v; this.render();
  }

  private applyStep(s: StepDef) {
    let e: Partial<Entry> | null = null;
    switch (s.k) {
      case 'usr': e = { g: '›', gc: C.k, gsh: GLOW, txt: s.t, tc: C.t, fw: 600 }; break;
      case 'out': e = { txt: s.t, tc: C.t }; break;
      case 'dim': e = { txt: s.t, tc: C.d }; break;
      case 'h1': e = { txt: s.t, tc: C.k, fw: 700 }; break;
      case 'li': e = { g: '•', gc: '#5A6890', txt: s.t, tc: C.t }; break;
      case 'tip': e = { g: '→', gc: C.k, gsh: GLOW, txt: s.t, tc: C.k }; break;
      case 'sel': e = { g: s.on ? '◉' : '○', gc: s.on ? C.k : '#5A6890', txt: s.t, tc: s.on ? C.t : C.d }; break;
      case 'kv': e = { k: s.kd, txt: s.t, tc: C.d }; break;
      case 'file': e = { g: '▪', gc: '#8FB8E8', txt: s.t, tc: C.t }; break;
      case 'ok': e = { g: '+', gc: '#79C98C', txt: s.t, tc: C.t }; break;
      case 'add': e = { g: '+', gc: C.s, txt: s.t, tc: C.t }; break;
      case 'warn': e = { g: '!', gc: '#E8B34B', txt: s.t, tc: C.d }; break;
      case 'err': e = { g: '×', gc: '#E86A6A', txt: s.t, tc: C.d }; break;
      case 'star': e = { g: '*', gc: C.k, gsh: GLOW, txt: s.t, tc: C.t }; break;
      case 'gur': e = { g: 'ੴ', gc: C.g, gsh: GLOW, txt: s.t, tc: C.g, fw: 600 }; break;
      case 'spin': e = { g: '⠋', gc: C.k, txt: s.t, tc: C.d }; break;
      case 'bar': e = { txt: s.t, tc: C.d, bar: true }; break;
      case 'blank': e = { txt: ' ', tc: C.d }; break;
    }
    if (!e) return;
    if (s.ind) e.ind = s.ind + 'px';
    const entry = norm(e);
    if (s.k === 'spin' || s.k === 'bar') this.st.run!.live.push({ s: s as never, e: entry });
    this.st.entries.push(entry);
    if (this.st.entries.length > 200) this.st.entries = this.st.entries.slice(-140);
  }

  private startRun(defs: StepDef[]) {
    this.st.run = mkRun(seq(defs));
    this.st.phase = 'run';
  }

  private fastForward() {
    const r = this.st.run;
    if (!r) { this.st.phase = 'idle'; return; }
    while (r.i < r.steps.length) { this.applyStep(r.steps[r.i]); r.i++; }
    finalizeLive(r);
    this.st.run = null; this.st.phase = 'idle';
  }

  private submit(textIn: string) {
    const text = (textIn || '').trim();
    if (!text) return;
    if (this.st.phase === 'run') this.fastForward();
    this.st.inputVal = ''; this.inputEl.value = ''; this.st.suppressVal = null; this.st.menuSel = 0;
    if (text[0] === '/') {
      const name = text.split(' ')[0].toLowerCase();
      const def = this.cmds.find((c) => c.cmd === name);
      if (def && def.special === 'clear') {
        this.st.entries = [norm({ txt: 'fresh start — ਸਹਿਜ (clean scrollback, clear mind)', tc: C.d })];
        return;
      }
      this.st.entries.push(norm({ g: '›', gc: C.k, gsh: GLOW, txt: text, tc: C.t, fw: 600 }));
      if (def && def.steps) {
        this.st.ctx = Math.min(88, this.st.ctx + 9);
        this.startRun(def.steps);
      } else {
        this.startRun([
          { k: 'err', t: `unknown command: ${name}`, gap: 200 },
          { k: 'dim', t: 'type /help — the dojo lists its lessons', gap: 120 },
          { k: 'blank', gap: 80 },
        ]);
      }
    } else {
      this.st.entries.push(norm({ g: '›', gc: C.k, gsh: GLOW, txt: text, tc: C.t, fw: 600 }));
      this.startRun([
        { k: 'spin', t: 'thinking …', dur: 700, done: "in a real session I'd take this task — write, run, iterate, repeat.", doneG: '*', doneGc: C.k, gap: 200 },
        { k: 'tip', t: 'this dojo teaches the / commands — type / to see them all', gap: 160 },
        { k: 'blank', gap: 80 },
      ]);
    }
  }

  private demoStop() {
    if (this.st.demo) {
      this.st.demo = false;
      if (this.st.demoSt.mode === 'typing') { this.st.inputVal = ''; this.inputEl.value = ''; }
      this.demoEl.textContent = 'ੴ chardi kala';
      this.demoEl.classList.add('off');
    }
  }

  private getMenu(): DojoCommand[] {
    const v = this.st.inputVal;
    if (!v || v[0] !== '/' || v.indexOf(' ') >= 0) return [];
    if (this.st.suppressVal === v) return [];
    const items = this.cmds.filter((c) => c.cmd.startsWith(v.toLowerCase()));
    if (this.st.menuSel >= items.length) this.st.menuSel = 0;
    return items;
  }

  private advance(dt: number): boolean {
    const st = this.st;
    if (st.phase === 'run') {
      const r = st.run!;
      const changed = stepLive(r, dt);
      let structural = false;
      while (r.i < r.steps.length && r.t >= r.steps[r.i].at) { this.applyStep(r.steps[r.i]); r.i++; structural = true; }
      if (r.i >= r.steps.length && !r.live.length && r.t >= r.end) { st.run = null; st.phase = 'idle'; }
      return changed || structural;
    }
    if (st.phase === 'idle' && st.demo) {
      const d = st.demoSt;
      d.t += dt;
      if (d.mode === 'pause') {
        if (d.t >= (d.first ? 1500 : 2600)) { d.mode = 'typing'; d.t = 0; d.first = false; }
        return false;
      }
      const cmd = this.demoSeq[d.i];
      const per = 46;
      const need = Math.min(cmd.length, Math.floor(d.t / per));
      let changed = false;
      if (st.inputVal !== cmd.slice(0, need)) { st.inputVal = cmd.slice(0, need); changed = true; }
      if (need >= cmd.length && d.t > cmd.length * per + 600) {
        d.mode = 'pause'; d.t = 0; d.i = (d.i + 1) % this.demoSeq.length;
        this.submit(cmd);
        return true;
      }
      return changed;
    }
    return false;
  }

  private render() {
    const st = this.st;
    this.bodyEl.innerHTML = st.entries.map((e) => this.entryHtml(e)).join('');
    const gap = this.scrollEl.scrollHeight - this.scrollEl.scrollTop - this.scrollEl.clientHeight;
    if (gap >= 0 && gap < 220) this.scrollEl.scrollTop = this.scrollEl.scrollHeight;

    // ghost text + placeholder
    this.ghostEl.textContent = st.inputVal;
    (this.root.querySelector('.i-dojo-placeholder') as HTMLElement).hidden = !!st.inputVal;

    // command palette
    const items = this.getMenu();
    if (items.length) {
      this.menuEl.hidden = false;
      this.menuEl.innerHTML =
        '<div class="i-dojo-menu-h">COMMANDS — arrow keys select &middot; tab completes &middot; enter runs</div>' +
        items.map((c, i) =>
          `<button class="i-dojo-menu-i${i === st.menuSel ? ' sel' : ''}" data-cmd="${esc(c.cmd)}"><span>${esc(c.cmd)}</span><span class="i-dojo-menu-d">${esc(c.desc)}</span></button>`,
        ).join('');
      this.menuEl.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) =>
        b.addEventListener('click', () => { this.demoStop(); this.submit(b.dataset.cmd!); this.render(); }));
    } else {
      this.menuEl.hidden = true;
    }

    this.ctxEl.textContent = `context: ${st.ctx}%`;
  }

  private entryHtml(e: Entry) {
    const kv = e.k ? `<span class="i-dojo-kv">${esc(e.k)}</span>` : '';
    const bar = e.bar
      ? `<span class="i-dojo-bar"><span style="width:${e.pctW}"></span></span><span class="i-dojo-bar-t">${e.pctText}</span>`
      : '';
    return `<div class="i-dojo-row" style="padding-left:${e.ind}"><span class="i-dojo-g" style="color:${e.gc};text-shadow:${e.gsh}">${esc(e.g)}</span>${kv}<span class="i-dojo-tx" style="color:${e.tc};font-weight:${e.fw}">${esc(e.txt)}</span>${e.cur ? cursorHtml : ''}${bar}</div>`;
  }

  // reduced motion: run /help once, statically
  private runStatic() {
    const help = this.cmds.find((c) => c.cmd === '/help' && c.steps);
    if (help?.steps) {
      const r = mkRun(seq(help.steps));
      while (r.i < r.steps.length) { this.applyStep(r.steps[r.i]); r.i++; }
      finalizeLive(r);
    }
    this.st.entries.unshift(norm({ g: '›', gc: C.k, gsh: GLOW, txt: '/help', tc: C.t, fw: 600 }));
    this.render();
    this.demoEl.textContent = 'reduced motion — type a / command to explore';
    this.demoEl.classList.add('off');
  }
}
