// The pure animation engine behind the two Sikh Code dojos (terminal.ts,
// repl.ts). Framework-free — a step sequencer with the timing math in one
// place, so an IDE-style typing demo and a REPL can share it.
//
// Ported from sikhi.io lib/learn/dojoAnim.ts. The one change: the default
// "done" glyph is '+' (ASCII) instead of a check mark — the no-emoji CI gate
// bans check/cross glyphs as source literals, and terminal surfaces read
// '+'/'x' fine.

export const COLORS = {
  k: '#F0A044', s: '#E3C377', f: '#8FB8E8', n: '#E8825A',
  c: '#4E5F86', p: '#7A87A8', t: '#E9E4D4', g: '#FFB454', d: '#8B96B2',
};
export const GLOW = '0 0 12px rgba(240,160,68,0.45)';
export const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface StepDef {
  k: string;
  t?: string;
  kd?: string;
  ind?: number;
  gap?: number;
  dur?: number;
  done?: string;
  doneG?: string;
  doneGc?: string;
  doneTc?: string;
  on?: boolean;
  pct?: number;
}

export interface TimedStep extends StepDef {
  at: number;
  dur: number;
}

export interface Entry {
  g: string; gc: string; gsh: string;
  txt: string; tc: string; fw: number;
  cur: boolean; bar: boolean; pctW: string; pctText: string;
  k: string; ind: string;
}

export function norm(e: Partial<Entry>): Entry {
  return Object.assign(
    { g: '', gc: COLORS.d, gsh: 'none', txt: '', tc: COLORS.t, fw: 400, cur: false, bar: false, pctW: '0%', pctText: '', k: '', ind: '0px' },
    e,
  );
}

/** Assigns timing offsets to a list of step defs, given a speed multiplier. */
export function seq(defs: StepDef[], speed = 1, defaultGap = 140): TimedStep[] {
  let t = 0;
  return defs.map((d) => {
    const s: TimedStep = { ...d, at: 0, dur: 0 };
    t += (d.gap != null ? d.gap : defaultGap) / speed;
    s.at = t;
    s.dur = (s.k === 'spin' || s.k === 'bar' || s.k === 'cmd') ? (s.dur || 900) / speed : 0;
    t += s.dur;
    return s;
  });
}

export interface Run {
  steps: TimedStep[];
  t: number;
  i: number;
  live: { s: TimedStep; e: Entry }[];
  end: number;
}

export function mkRun(steps: TimedStep[]): Run {
  const last = steps[steps.length - 1];
  return { steps, t: 0, i: 0, live: [], end: last ? last.at + last.dur + 250 : 0 };
}

/** Advances the live spin/bar/cmd entries within a run by dt ms. Returns true if anything changed. */
export function stepLive(run: Run, dt: number): boolean {
  run.t += dt;
  let changed = false;
  for (let li = run.live.length - 1; li >= 0; li--) {
    const L = run.live[li], s = L.s, e = L.e, tau = run.t - s.at;
    if (s.k === 'spin') {
      if (tau >= s.dur) {
        e.g = s.doneG || '+'; e.gc = s.doneGc || '#79C98C'; e.gsh = s.doneG ? GLOW : 'none';
        e.txt = s.done || e.txt; e.tc = s.doneTc || COLORS.t;
        run.live.splice(li, 1);
      } else {
        e.g = SPIN[Math.floor(tau / 80) % SPIN.length];
      }
      changed = true;
    } else if (s.k === 'bar') {
      const p = Math.min(1, tau / s.dur), ease = 1 - Math.pow(1 - p, 3), v = Math.round((s.pct || 0) * ease);
      e.pctW = v + '%'; e.pctText = v + '%';
      if (p >= 1) run.live.splice(li, 1);
      changed = true;
    } else if (s.k === 'cmd') {
      e.txt = (s.t || '').slice(0, Math.min((s.t || '').length, Math.floor(tau / 26)));
      if (tau >= s.dur) { e.txt = s.t || ''; e.cur = false; run.live.splice(li, 1); }
      changed = true;
    }
  }
  return changed;
}

export function finalizeLive(run: Run): void {
  run.live.forEach(({ s, e }) => {
    if (s.k === 'spin') { e.g = s.doneG || '+'; e.gc = s.doneGc || '#79C98C'; e.gsh = 'none'; e.txt = s.done || e.txt; e.tc = COLORS.t; }
    if (s.k === 'bar') { e.pctW = (s.pct || 0) + '%'; e.pctText = (s.pct || 0) + '%'; }
    if (s.k === 'cmd') { e.txt = s.t || ''; e.cur = false; }
  });
  run.live = [];
}
