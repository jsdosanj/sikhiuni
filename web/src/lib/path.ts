// "My path": pure functions that turn the data this site already holds
// (the course index, the per-course lesson record, the daily activity grid)
// into what the learner dashboard shows. No fetching and no storage here, so
// every rule on the page can be unit-tested (test/my-path.test.ts).
//
// The rhythm, week and milestone rules are the family rules shared with
// sikhi.io (lib/progress/path.ts there). Keep them in step. See
// DESIGN-LIQUID.md, section 6.

export interface GridDay { day: string; activeSeconds: number }
export interface CourseLite { id: string; title: string; topic: string; level: number; nLessons: number; nQuiz?: number }
export interface TopicLite { id: string; name: string }
/** One course's record: lesson indices done, and whether the test is passed. */
export interface CourseRecord { done: number[]; passed: boolean }
export type Records = Record<string, CourseRecord>;
/** A lesson marked complete on this device (kept from the redesign onward). */
export interface LogEntry { t: number; course: string; lesson: number }

const DAY_MS = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (day: string) => new Date(`${day}T00:00:00Z`);
const nf = new Intl.NumberFormat('en-GB');
export const formatCount = (n: number) => nf.format(n);
const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

// ── Reading the device record ──────────────────────────────────────────────

/** The course page stores `{ "0": true, "3": true }`; the server stores `[0, 3]`. */
export function doneList(raw: unknown, nLessons: number): number[] {
  const out = new Set<number>();
  const add = (v: unknown) => { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n < nLessons) out.add(n); };
  if (Array.isArray(raw)) raw.forEach(add);
  else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v) add(k);
  return [...out].sort((a, b) => a - b);
}

/** The older device record lists active days as local `Y-M-D`, unpadded. */
export function gridFromLocalDays(days: string[], today: string, span = 371): GridDay[] {
  const active = new Set(days.map((d) => {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(d));
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }));
  const end = parseDay(today).getTime();
  const grid: GridDay[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = dayKey(new Date(end - i * DAY_MS));
    grid.push({ day, activeSeconds: active.has(day) ? 60 : 0 });
  }
  return grid;
}

// ── Rhythm: a humane streak ────────────────────────────────────────────────
// One missed day in any seven is a rest day and does not break the rhythm.
// Today is never counted as missed while it is still today.

export interface Rhythm { days: number; restDays: number; restDayKeys: string[]; activeToday: boolean; best: number }

function runEndingAt(active: boolean[], end: number): { days: number; rests: number[] } {
  let days = 0;
  let lastRest = Number.POSITIVE_INFINITY;
  const rests: number[] = [];
  for (let i = end; i >= 0; i--) {
    if (active[i]) { days++; continue; }
    // A rest day must sit between two active days, at most once in seven.
    const bridges = i > 0 && active[i - 1] && days > 0;
    if (bridges && lastRest - i >= 7) { rests.push(i); lastRest = i; continue; }
    break;
  }
  return { days, rests };
}

export function humaneRhythm(grid: GridDay[], thresholdSeconds = 60): Rhythm {
  if (!grid.length) return { days: 0, restDays: 0, restDayKeys: [], activeToday: false, best: 0 };
  const active = grid.map((d) => d.activeSeconds >= thresholdSeconds);
  const last = active.length - 1;
  const activeToday = active[last];
  const current = runEndingAt(active, activeToday ? last : last - 1);
  let best = current.days;
  for (let i = last; i >= 0; i--) {
    if (!active[i] || (i < last && active[i + 1])) continue;
    best = Math.max(best, runEndingAt(active, i).days);
  }
  return { days: current.days, restDays: current.rests.length, restDayKeys: current.rests.map((i) => grid[i].day), activeToday, best };
}

/** Copy for the rhythm card. It encourages; it never counts what was lost. */
export function rhythmMessage(r: Rhythm): string {
  if (r.days === 0) return 'Every path begins with one day. Learn for a minute and yours begins.';
  if (!r.activeToday) return r.days === 1
    ? 'You learned yesterday. Today is open whenever you are ready.'
    : `${r.days} days of learning. Today is open whenever you are ready.`;
  if (r.days === 1) return 'You learned today. That is how a rhythm begins.';
  return r.restDays > 0 ? `${r.days} days of learning, with rest where you needed it.` : `${r.days} days of learning in a row.`;
}

// ── Week: the goal the learner sets ────────────────────────────────────────

export interface WeekDay { day: string; letter: string; active: boolean; rest: boolean; today: boolean; future: boolean }
export interface Week { days: WeekDay[]; done: number; goal: number; met: boolean; remaining: number; reachable: boolean }

export const DEFAULT_WEEKLY_GOAL = 4;
export const clampGoal = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(7, Math.max(1, v)) : DEFAULT_WEEKLY_GOAL;
};

/** Monday-to-Sunday week (UTC, like the grid) holding `today`. */
export function weekProgress(grid: GridDay[], goal: number, today: string, thresholdSeconds = 60, restDayKeys: string[] = []): Week {
  const g = clampGoal(goal);
  const seconds = new Map(grid.map((d) => [d.day, d.activeSeconds]));
  const t = parseDay(today);
  const monday = new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY_MS);
  const days: WeekDay[] = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => {
    const day = dayKey(new Date(monday.getTime() + i * DAY_MS));
    return { day, letter, active: (seconds.get(day) ?? 0) >= thresholdSeconds, rest: restDayKeys.includes(day), today: day === today, future: day > today };
  });
  const done = days.filter((d) => d.active).length;
  const open = days.filter((d) => !d.active && (d.today || d.future)).length;
  return { days, done, goal: g, met: done >= g, remaining: Math.max(0, g - done), reachable: done + open >= g };
}

export function weekMessage(w: Week): string {
  if (w.met) return w.done > w.goal ? `Goal met, and ${w.done - w.goal} more besides.` : 'Goal met for this week.';
  if (w.done === 0) return `Your goal is ${w.goal} ${w.goal === 1 ? 'day' : 'days'} this week. Start whenever suits you.`;
  if (!w.reachable) return `${w.done} ${w.done === 1 ? 'day' : 'days'} this week. A new week starts on Monday.`;
  return `${w.done} of ${w.goal} days. ${w.remaining} to go, in your own time.`;
}

// ── Courses ────────────────────────────────────────────────────────────────

export interface CourseProgress {
  course: CourseLite;
  done: number;
  total: number;
  value: number;
  passed: boolean;
  /** Index of the first lesson not yet done, or null when every lesson is done. */
  nextLesson: number | null;
  state: 'started' | 'lessons-done' | 'complete';
  href: string;
}

export function courseProgress(course: CourseLite, rec: CourseRecord | undefined): CourseProgress {
  const total = Math.max(0, course.nLessons | 0);
  const done = rec ? doneList(rec.done, total) : [];
  const passed = !!rec?.passed;
  let nextLesson: number | null = null;
  for (let i = 0; i < total; i++) if (!done.includes(i)) { nextLesson = i; break; }
  const state = passed ? 'complete' : nextLesson == null && total > 0 ? 'lessons-done' : 'started';
  const href = `/course/${course.id}` + (passed ? '' : nextLesson != null ? `#lesson-${nextLesson}` : '#test');
  return { course, done: done.length, total, value: total ? done.length / total : passed ? 1 : 0, passed, nextLesson, state, href };
}

/** Every course the learner has touched, the last-opened one first, then by how far along. */
export function startedCourses(courses: CourseLite[], records: Records, lastCourse?: string | null): CourseProgress[] {
  const out = courses
    .filter((c) => records[c.id] && (records[c.id].passed || doneList(records[c.id].done, c.nLessons).length > 0))
    .map((c) => courseProgress(c, records[c.id]));
  const rank = (p: CourseProgress) => (p.course.id === lastCourse ? 2 : 0) + (p.state === 'complete' ? 0 : 1);
  return out.sort((a, b) => rank(b) - rank(a) || b.value - a.value || a.course.title.localeCompare(b.course.title));
}

export interface Totals { lessons: number; coursesStarted: number; coursesComplete: number; testsPassed: number }
export function totals(list: CourseProgress[]): Totals {
  return {
    lessons: list.reduce((n, p) => n + p.done, 0),
    coursesStarted: list.length,
    coursesComplete: list.filter((p) => p.passed).length,
    testsPassed: list.filter((p) => p.passed).length,
  };
}

// ── Rings: progress per area of study ──────────────────────────────────────

export interface AreaRing { id: string; label: string; value: number; figure: string; detail: string; href: string }

/** One ring per subject the learner has started: lessons done out of the lessons in the courses they began. */
export function areaRings(list: CourseProgress[], topics: TopicLite[], limit = 6): AreaRing[] {
  const by = new Map<string, CourseProgress[]>();
  for (const p of list) by.set(p.course.topic, [...(by.get(p.course.topic) ?? []), p]);
  const rings: AreaRing[] = [];
  for (const [topic, items] of by) {
    const done = items.reduce((n, p) => n + p.done, 0);
    const total = items.reduce((n, p) => n + p.total, 0);
    const complete = items.filter((p) => p.passed).length;
    rings.push({
      id: topic,
      label: topics.find((t) => t.id === topic)?.name ?? topic,
      value: total ? done / total : 0,
      figure: `${done}/${total}`,
      detail: `${plural(done, 'lesson', 'lessons')} of ${formatCount(total)} across ${plural(items.length, 'course', 'courses')}${complete ? `, ${formatCount(complete)} complete` : ''}`,
      href: `/catalog?topic=${encodeURIComponent(topic)}`,
    });
  }
  return rings.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit);
}

// ── Milestones ─────────────────────────────────────────────────────────────

export interface Milestone { id: string; title: string; detail: string; achieved: boolean; progress: number }

export function milestones(t: Totals, activeDays: number, rhythm: Rhythm, subjects: number): Milestone[] {
  const step = (id: string, title: string, detail: string, have: number, need: number): Milestone =>
    ({ id, title, detail, achieved: have >= need, progress: Math.min(1, have / need) });
  return [
    step('first-lesson', 'First lesson', 'Complete your first lesson', t.lessons, 1),
    step('lessons-10', 'Ten lessons', 'Ten lessons complete', t.lessons, 10),
    step('lessons-50', 'Fifty lessons', 'Fifty lessons complete', t.lessons, 50),
    step('lessons-200', 'Two hundred lessons', 'Two hundred lessons complete', t.lessons, 200),
    step('first-course', 'First course', 'Pass the test at the end of a course', t.coursesComplete, 1),
    step('courses-5', 'Five courses', 'Five courses complete', t.coursesComplete, 5),
    step('subjects-3', 'Three subjects', 'Begin courses in three different subjects', subjects, 3),
    step('rhythm-7', 'A week of learning', 'Seven days of learning, rest days allowed', Math.max(rhythm.days, rhythm.best), 7),
    step('days-30', 'Thirty days', 'Thirty active days in the past year', activeDays, 30),
    step('days-100', 'One hundred days', 'One hundred active days in the past year', activeDays, 100),
  ];
}

/** The milestone closest to being reached, for "next milestone". */
export function nextMilestone(list: Milestone[]): Milestone | null {
  const open = list.filter((m) => !m.achieved);
  if (!open.length) return null;
  return open.reduce((a, b) => (b.progress > a.progress ? b : a));
}

// ── Timeline: recent learning, newest first ────────────────────────────────

export interface TimelineItem { title: string; detail: string; href: string }
export interface TimelineDay { day: string; label: string; minutes: number | null; items: TimelineItem[] }

const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Lessons from the device log, grouped by day, joined with the minutes the
 * activity grid records for that day. Days with activity but no logged lesson
 * still appear, so the timeline is honest about time spent.
 */
export function timeline(log: LogEntry[], grid: GridDay[], courses: CourseLite[], now = Date.now(), maxDays = 7): TimelineDay[] {
  const title = new Map(courses.map((c) => [c.id, c.title]));
  const today = localDay(now);
  const yesterday = localDay(now - DAY_MS);
  const days = new Map<string, TimelineDay>();
  const bucket = (day: string): TimelineDay => {
    let b = days.get(day);
    if (!b) {
      const label = day === today ? 'Today' : day === yesterday ? 'Yesterday'
        : parseDay(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      b = { day, label, minutes: null, items: [] };
      days.set(day, b);
    }
    return b;
  };
  for (const e of [...log].sort((a, b) => b.t - a.t)) {
    if (!title.has(e.course)) continue;
    bucket(localDay(e.t)).items.push({ title: title.get(e.course)!, detail: `Lesson ${e.lesson + 1} complete`, href: `/course/${e.course}#lesson-${e.lesson}` });
  }
  for (const g of grid) if (g.activeSeconds >= 60) bucket(g.day).minutes = Math.round(g.activeSeconds / 60);
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, maxDays);
}

// ── Next best step: one suggestion, one button ─────────────────────────────

export interface NextStep { kind: 'resume' | 'test' | 'onward' | 'begin'; eyebrow: string; title: string; body: string; href: string; cta: string }

export function nextBestStep(list: CourseProgress[], courses: CourseLite[], week: Week | null): NextStep {
  const open = list.find((p) => p.state === 'started');
  if (open) {
    const left = open.total - open.done;
    const weekLine = week && !week.met && week.reachable ? ` One lesson today makes ${week.done + (week.days.some((d) => d.today && d.active) ? 0 : 1)} of your ${week.goal} days this week.` : '';
    return { kind: 'resume', eyebrow: 'Continue', title: open.course.title, body: `Lesson ${(open.nextLesson ?? 0) + 1} of ${open.total} is next, with ${plural(left, 'lesson', 'lessons')} to go.${weekLine}`, href: open.href, cta: 'Continue the lesson' };
  }
  const ready = list.find((p) => p.state === 'lessons-done');
  if (ready) {
    return { kind: 'test', eyebrow: 'Ready when you are', title: `Take the test for ${ready.course.title}`, body: 'You have finished every lesson. The test is short, and you can take it again.', href: ready.href, cta: 'Open the test' };
  }
  const last = list.find((p) => p.passed);
  if (last) {
    const touched = new Set(list.map((p) => p.course.id));
    const onward = courses
      .filter((c) => c.topic === last.course.topic && !touched.has(c.id) && c.nLessons > 0)
      .sort((a, b) => Math.abs(a.level - last.course.level) - Math.abs(b.level - last.course.level) || a.level - b.level)[0];
    if (onward) return { kind: 'onward', eyebrow: 'Onward', title: onward.title, body: `You completed ${last.course.title}. This course follows on in the same subject.`, href: `/course/${onward.id}`, cta: 'Open the course' };
  }
  return { kind: 'begin', eyebrow: 'Begin', title: 'Begin with the foundations', body: 'New to Sikhi, or returning to it? Start with one question and one lesson.', href: '/catalog#foundations', cta: 'Explore the foundations' };
}
