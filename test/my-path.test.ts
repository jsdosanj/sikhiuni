import { describe, expect, it } from "vitest";
import {
  areaRings, clampGoal, courseProgress, doneList, gridFromLocalDays, humaneRhythm, milestones, nextBestStep,
  nextMilestone, rhythmMessage, startedCourses, timeline, totals, weekMessage, weekProgress, type CourseLite, type GridDay,
} from "../web/src/lib/path";

const grid = (pattern: string, end = "2026-11-13"): GridDay[] => {
  const t = new Date(`${end}T00:00:00Z`).getTime();
  return [...pattern].map((ch, i) => ({ day: new Date(t - (pattern.length - 1 - i) * 86_400_000).toISOString().slice(0, 10), activeSeconds: ch === "x" ? 300 : 0 }));
};
const courses: CourseLite[] = [
  { id: "a", title: "Alpha", topic: "history", level: 100, nLessons: 4 },
  { id: "b", title: "Beta", topic: "history", level: 200, nLessons: 2 },
  { id: "c", title: "Gamma", topic: "gurbani", level: 100, nLessons: 5 },
];
const topics = [{ id: "history", name: "History" }, { id: "gurbani", name: "Gurbani" }];

describe("device record", () => {
  it("reads both the object and the array shape, ignoring out-of-range lessons", () => {
    expect(doneList({ "0": true, "2": true, "3": false, "9": true }, 4)).toEqual([0, 2]);
    expect(doneList([1, 1, 3, -1, "2"], 4)).toEqual([1, 2, 3]);
    expect(doneList(null, 4)).toEqual([]);
  });
  it("turns the unpadded local day list into a grid ending today", () => {
    const g = gridFromLocalDays(["2026-11-9", "2026-11-13"], "2026-11-13", 7);
    expect(g.map((d) => (d.activeSeconds ? "x" : ".")).join("")).toBe("..x...x");
    expect(g[6].day).toBe("2026-11-13");
  });
});

describe("humane rhythm", () => {
  it("keeps the rhythm across one rest day in seven", () => {
    const r = humaneRhythm(grid("xxx.xxx"));
    expect(r.days).toBe(6); expect(r.restDays).toBe(1); expect(r.activeToday).toBe(true);
  });
  it("does not bridge two missed days, or two rests inside seven days", () => {
    expect(humaneRhythm(grid("xxx..xx")).days).toBe(2);
    expect(humaneRhythm(grid("xx.xx.xx")).days).toBe(4);
  });
  it("never counts today as missed while it is still today", () => {
    const r = humaneRhythm(grid("xxx."));
    expect(r.days).toBe(3); expect(r.activeToday).toBe(false);
  });
  it("is zero, not an error, on an empty grid", () => { expect(humaneRhythm([]).days).toBe(0); });
  it("never uses shaming words", () => {
    const all = [humaneRhythm([]), humaneRhythm(grid("xxx.")), humaneRhythm(grid("x")), humaneRhythm(grid("xxx.xxx")), humaneRhythm(grid(".x"))].map(rhythmMessage)
      .concat([0, 1, 2, 5].flatMap((n) => [weekMessage(weekProgress(grid("x".repeat(n).padStart(7, ".")), 4, "2026-11-13")), weekMessage(weekProgress(grid("x".repeat(n).padEnd(7, "."), "2026-11-15"), 4, "2026-11-15"))]));
    for (const m of all) expect(m).not.toMatch(/lost|broke|broken|fail|missed|behind|streak|don't|only/i);
  });
});

describe("week", () => {
  it("clamps the goal to one to seven days", () => {
    expect(clampGoal(0)).toBe(1); expect(clampGoal(12)).toBe(7); expect(clampGoal("x")).toBe(4);
  });
  it("counts a Monday-to-Sunday week and knows when the goal is still reachable", () => {
    // 2026-11-13 is a Friday.
    const w = weekProgress(grid("x.x.x"), 4, "2026-11-13");
    expect(w.days.map((d) => d.letter).join("")).toBe("MTWTFSS");
    expect(w.done).toBe(3); expect(w.met).toBe(false); expect(w.reachable).toBe(true); expect(w.remaining).toBe(1);
    expect(weekProgress(grid("x......", "2026-11-15"), 4, "2026-11-15").reachable).toBe(false);
  });
});

describe("courses, rings and milestones", () => {
  const records = { a: { done: [0, 1], passed: false }, b: { done: [0, 1], passed: true }, c: { done: [], passed: false } };
  const list = startedCourses(courses, records, "a");
  it("lists only courses the learner has touched, the last-opened first", () => {
    expect(list.map((p) => p.course.id)).toEqual(["a", "b"]);
    expect(list[0].nextLesson).toBe(2); expect(list[0].href).toBe("/course/a#lesson-2");
    expect(courseProgress(courses[0], { done: [0, 1, 2, 3], passed: false }).href).toBe("/course/a#test");
  });
  it("totals and rings come from the same record", () => {
    expect(totals(list)).toEqual({ lessons: 4, coursesStarted: 2, coursesComplete: 1, testsPassed: 1 });
    const rings = areaRings(list, topics);
    expect(rings).toHaveLength(1); expect(rings[0].label).toBe("History"); expect(rings[0].figure).toBe("4/6");
  });
  it("offers the nearest open milestone", () => {
    const m = milestones(totals(list), 3, humaneRhythm(grid("xxx")), 1);
    expect(m.find((x) => x.id === "first-lesson")!.achieved).toBe(true);
    expect(nextMilestone(m)!.id).toBe("rhythm-7");
  });
  it("suggests one next step: resume, then the test, then onward, then a beginning", () => {
    expect(nextBestStep(list, courses, null).kind).toBe("resume");
    expect(nextBestStep(startedCourses(courses, { a: { done: [0, 1, 2, 3], passed: false } }), courses, null).kind).toBe("test");
    const onward = nextBestStep(startedCourses(courses, { a: { done: [0, 1, 2, 3], passed: true } }), courses, null);
    expect(onward.kind).toBe("onward"); expect(onward.href).toBe("/course/b");
    expect(nextBestStep([], courses, null).kind).toBe("begin");
  });
  it("groups the device log by day and joins the minutes from the grid", () => {
    const now = new Date("2026-11-13T12:00:00").getTime();
    const days = timeline([{ t: now - 1000, course: "a", lesson: 1 }, { t: now, course: "zz", lesson: 0 }], [{ day: "2026-11-13", activeSeconds: 600 }], courses, now);
    expect(days[0].label).toBe("Today"); expect(days[0].minutes).toBe(10); expect(days[0].items).toHaveLength(1);
  });
});
