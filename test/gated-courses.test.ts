// Gated/institutional courses: functions/api/course-content.js (content-viewing
// entitlement) and the gated-grading branch grafted into functions/api/quiz.js.
// Entitlement = course teacher/admin, or a member of a cohort tied to the course
// (functions/api/cohorts.js) — payment itself is handled entirely by the
// licensing institution on their own site. Stateful fake D1.
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestGet as courseContentGet } from "../functions/api/course-content.js";
import { onRequestPost as quizPost } from "../functions/api/quiz.js";
import { req } from "./helpers";

const GATED_COURSE = "test-gated-course-xyz"; // guaranteed absent from the real QUIZ_KEYS

function fakeDB() {
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();
  const courseTeachers = new Set<string>(); // `${courseId}|${userId}`
  const cohorts = new Map<string, any>(); // id -> { id, course_id }
  const cohortMembers = new Set<string>(); // `${cohortId}|${userId}`
  const courseDrafts = new Map<string, any>(); // draftId -> { id, course_id, status, visibility, updated_at }
  const draftLessons = new Map<string, any[]>();
  const draftQuiz = new Map<string, any[]>();
  const progress = new Map<string, any>(); // `${userId}|${courseId}` -> { passed_score }

  function handleFirst(sql: string, b: any[]) {
    if (sql.includes("FROM sessions s JOIN users u")) {
      const [sid, now] = b;
      const s = sessions.get(sid);
      if (!s || s.expires_at <= now) return null;
      const u = users.get(s.user_id);
      return u ? { id: u.id, email: u.email, name: u.name, role: u.role, mfa_ok: s.mfa_ok } : null;
    }
    if (sql.includes("FROM course_teachers WHERE user_id=? AND course_id=?")) {
      const [userId, courseId] = b;
      return courseTeachers.has(`${courseId}|${userId}`) ? { x: 1 } : null;
    }
    if (sql.includes("cohort_members cm JOIN cohorts c")) {
      const [userId, courseId] = b;
      for (const [cohortId, cohort] of cohorts) {
        if (cohort.course_id === courseId && cohortMembers.has(`${cohortId}|${userId}`)) return { x: 1 };
      }
      return null;
    }
    if (sql.includes("SELECT id FROM course_drafts WHERE course_id=? AND status='published' ORDER BY")) {
      const courseId = b[0];
      let best: any = null;
      for (const d of courseDrafts.values()) if (d.course_id === courseId && d.status === "published") { if (!best || d.updated_at > best.updated_at) best = d; }
      return best ? { id: best.id } : null;
    }
    if (sql.includes("SELECT id FROM course_drafts WHERE course_id=? AND status='published' AND visibility='gated' ORDER BY")) {
      const courseId = b[0];
      let best: any = null;
      for (const d of courseDrafts.values()) if (d.course_id === courseId && d.status === "published" && d.visibility === "gated") { if (!best || d.updated_at > best.updated_at) best = d; }
      return best ? { id: best.id } : null;
    }
    if (sql.includes("passed_score FROM progress")) {
      const [userId, courseId] = b;
      return progress.get(`${userId}|${courseId}`) || null;
    }
    return null;
  }
  function handleRun(sql: string) {
    return { success: true };
  }
  function handleAll(sql: string, b: any[]) {
    if (sql.includes("SELECT idx, title, summary, html FROM draft_lessons")) {
      return { results: draftLessons.get(b[0]) || [] };
    }
    if (sql.includes("SELECT idx, q, options FROM draft_quiz")) {
      return { results: (draftQuiz.get(b[0]) || []).map((q) => ({ idx: q.idx, q: q.q, options: q.options })) };
    }
    if (sql.includes("SELECT idx, answer FROM draft_quiz")) {
      return { results: (draftQuiz.get(b[0]) || []).map((q) => ({ idx: q.idx, answer: q.answer })) };
    }
    return { results: [] };
  }
  function prepare(sql: string) {
    let bound: any[] = [];
    const self = {
      bind(...args: any[]) { bound = args; return self; },
      async first() { return handleFirst(sql, bound); },
      async run() { return handleRun(sql); },
      async all() { return handleAll(sql, bound); },
    };
    return self;
  }
  return { prepare, users, sessions, courseTeachers, cohorts, cohortMembers, courseDrafts, draftLessons, draftQuiz, progress };
}

function seedUser(env: any, { id, role = "learner" }: any) {
  env.DB.users.set(id, { id, email: id + "@example.com", name: id, role });
  env.DB.sessions.set("sid-" + id, { user_id: id, expires_at: Date.now() + 100000, mfa_ok: 1 });
}
function asReq(id: string | null, body: unknown, url: string) {
  return req({ url, cookie: id ? "sid-" + id : undefined, body });
}
function makeEnv() { return { DB: fakeDB() }; }

function publishGatedDraft(env: any) {
  const draftId = "draft-1";
  env.DB.courseDrafts.set(draftId, { id: draftId, course_id: GATED_COURSE, status: "published", visibility: "gated", updated_at: Date.now() });
  env.DB.draftLessons.set(draftId, [
    { idx: 0, title: "Lesson One", summary: null, html: "<p>Real gated content.</p>" },
    { idx: 1, title: "Lesson Two", summary: null, html: "<p>More gated content.</p>" },
  ]);
  env.DB.draftQuiz.set(draftId, [
    { idx: 0, q: "What is 2+2?", options: JSON.stringify(["3", "4"]), answer: 1 },
  ]);
  return draftId;
}

describe("GET /api/course-content", () => {
  let env: any;
  beforeEach(() => {
    env = makeEnv();
    seedUser(env, { id: "teacher1", role: "teacher" });
    seedUser(env, { id: "admin1", role: "admin" });
    seedUser(env, { id: "member1" });
    seedUser(env, { id: "stranger1" });
    env.DB.courseTeachers.add(`${GATED_COURSE}|teacher1`);
    env.DB.cohorts.set("cohort1", { id: "cohort1", course_id: GATED_COURSE });
    env.DB.cohortMembers.add("cohort1|member1");
    publishGatedDraft(env);
  });

  it("anonymous -> 401", async () => {
    const res = await courseContentGet({ request: req({ url: `http://x/api/course-content?courseId=${GATED_COURSE}` }), env });
    expect(res.status).toBe(401);
  });

  it("a stranger (signed in, no relationship to the course) -> 403", async () => {
    const res = await courseContentGet({ request: asReq("stranger1", undefined, `http://x/api/course-content?courseId=${GATED_COURSE}`), env });
    expect(res.status).toBe(403);
  });

  it("the course's teacher -> 200 with full lesson content", async () => {
    const res = await courseContentGet({ request: asReq("teacher1", undefined, `http://x/api/course-content?courseId=${GATED_COURSE}`), env });
    expect(res.status).toBe(200);
    const { lessons } = await res.json();
    expect(lessons).toHaveLength(2);
    expect(lessons[0].html).toBe("<p>Real gated content.</p>");
  });

  it("admin -> 200 regardless of cohort/teaching relationship", async () => {
    const res = await courseContentGet({ request: asReq("admin1", undefined, `http://x/api/course-content?courseId=${GATED_COURSE}`), env });
    expect(res.status).toBe(200);
  });

  it("a cohort member -> 200", async () => {
    const res = await courseContentGet({ request: asReq("member1", undefined, `http://x/api/course-content?courseId=${GATED_COURSE}`), env });
    expect(res.status).toBe(200);
  });

  it("quiz questions never include the answer field", async () => {
    const res = await courseContentGet({ request: asReq("member1", undefined, `http://x/api/course-content?courseId=${GATED_COURSE}`), env });
    const { quiz } = await res.json();
    expect(quiz).toHaveLength(1);
    expect(quiz[0]).not.toHaveProperty("answer");
    expect(quiz[0].options).toEqual(["3", "4"]);
  });

  it("missing courseId -> 400", async () => {
    const res = await courseContentGet({ request: asReq("member1", undefined, "http://x/api/course-content"), env });
    expect(res.status).toBe(400);
  });

  it("no published draft for that course -> 404 (even for an entitled admin)", async () => {
    seedUser(env, { id: "admin1", role: "admin" });
    const res = await courseContentGet({ request: asReq("admin1", undefined, "http://x/api/course-content?courseId=no-such-course"), env });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/quiz — gated course grading", () => {
  let env: any;
  beforeEach(() => {
    env = makeEnv();
    seedUser(env, { id: "teacher1", role: "teacher" });
    seedUser(env, { id: "member1" });
    seedUser(env, { id: "stranger1" });
    env.DB.courseTeachers.add(`${GATED_COURSE}|teacher1`);
    env.DB.cohorts.set("cohort1", { id: "cohort1", course_id: GATED_COURSE });
    env.DB.cohortMembers.add("cohort1|member1");
    publishGatedDraft(env);
  });

  it("a non-gated unknown course still 404s (existing behavior untouched)", async () => {
    const res = await quizPost({ request: req({ url: "http://x/api/quiz", body: { courseId: "no-such-course-at-all", answers: [] } }), env });
    expect(res.status).toBe(404);
  });

  it("anonymous request for a gated course -> 401 (unlike free courses, which allow anonymous grading)", async () => {
    const res = await quizPost({ request: req({ url: "http://x/api/quiz", body: { courseId: GATED_COURSE, answers: [1] } }), env });
    expect(res.status).toBe(401);
  });

  it("a stranger (signed in, not entitled) -> 403", async () => {
    const res = await quizPost({ request: asReq("stranger1", { courseId: GATED_COURSE, answers: [1] }, "http://x/api/quiz"), env });
    expect(res.status).toBe(403);
  });

  it("a cohort member submitting the correct answer -> passed", async () => {
    const res = await quizPost({ request: asReq("member1", { courseId: GATED_COURSE, answers: [1] }, "http://x/api/quiz"), env });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(100);
    expect(body.passed).toBe(true);
  });

  it("a cohort member submitting the wrong answer -> not passed, no score leaked", async () => {
    const res = await quizPost({ request: asReq("member1", { courseId: GATED_COURSE, answers: [0] }, "http://x/api/quiz"), env });
    const body = await res.json();
    expect(body.passed).toBe(false);
    expect(body.score).toBeUndefined();
  });

  it("the course's own teacher can also grade (entitled via isCourseTeacher, not cohort membership)", async () => {
    const res = await quizPost({ request: asReq("teacher1", { courseId: GATED_COURSE, answers: [1] }, "http://x/api/quiz"), env });
    expect(res.status).toBe(200);
  });
});
