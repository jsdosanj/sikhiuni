// Assignments, submissions, and grading: ownership matrix, resubmit-until-graded,
// late flag, grade bounds, and the file-submission ownership check against
// media_objects. Uses a stateful fake D1.
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestGet as assignGet, onRequestPost as assignPost } from "../functions/api/assignments.js";
import { onRequestGet as subGet, onRequestPost as subPost } from "../functions/api/submissions.js";
import { onRequestPost as gradePost } from "../functions/api/submissions/grade.js";
import { req } from "./helpers";

function fakeDB() {
  const users = new Map<string, any>();
  const sessions = new Map<string, any>();
  const courseTeachers = new Set<string>();
  const enrollments = new Set<string>(); // `${userId}|${courseId}`
  const assignments = new Map<string, any>();
  const submissions = new Map<string, any>(); // by id
  const media = new Map<string, any>();

  function subByPair(assignmentId: string, userId: string) {
    return [...submissions.values()].find((s) => s.assignment_id === assignmentId && s.user_id === userId);
  }

  function handleFirst(sql: string, b: any[]) {
    if (sql.includes("FROM sessions s JOIN users u")) {
      const [sid, now] = b;
      const s = sessions.get(sid);
      if (!s || s.expires_at <= now) return null;
      const u = users.get(s.user_id);
      return u ? { id: u.id, email: u.email, name: u.name, role: u.role, mfa_ok: 1 } : null;
    }
    if (sql.includes("SELECT 1 FROM course_teachers")) return courseTeachers.has(`${b[0]}|${b[1]}`) ? { x: 1 } : null;
    if (sql.includes("SELECT 1 FROM enrollments")) return enrollments.has(`${b[0]}|${b[1]}`) ? { x: 1 } : null;
    if (sql.includes("SELECT course_id FROM assignments WHERE id=?")) {
      const a = assignments.get(b[0]);
      return a ? { course_id: a.course_id } : null;
    }
    if (sql.includes("SELECT course_id, points FROM assignments WHERE id=?")) {
      const a = assignments.get(b[0]);
      return a ? { course_id: a.course_id, points: a.points } : null;
    }
    if (sql.includes("SELECT course_id, due_at, allow_file, status FROM assignments WHERE id=?")) {
      const a = assignments.get(b[0]);
      return a ? { course_id: a.course_id, due_at: a.due_at, allow_file: a.allow_file, status: a.status } : null;
    }
    if (sql.includes("SELECT status FROM submissions WHERE assignment_id=? AND user_id=?")) {
      const s = subByPair(b[0], b[1]);
      return s ? { status: s.status } : null;
    }
    if (sql.includes("SELECT id, text_content, file_key, submitted_at, updated_at, late, grade, feedback, status FROM submissions")) {
      const s = subByPair(b[0], b[1]);
      return s || null;
    }
    if (sql.includes("SELECT owner_id, kind, context FROM media_objects WHERE key=?")) {
      const m = media.get(b[0]);
      return m || null;
    }
    if (sql.includes("SELECT s.assignment_id, s.user_id, a.course_id, a.points, a.title FROM submissions s JOIN assignments a")) {
      const s = submissions.get(b[0]);
      if (!s) return null;
      const a = assignments.get(s.assignment_id);
      return { assignment_id: s.assignment_id, user_id: s.user_id, course_id: a.course_id, points: a.points, title: a.title };
    }
    return null;
  }
  function handleRun(sql: string, b: any[]) {
    if (sql.startsWith("CREATE TABLE")) return { success: true };
    if (sql.includes("INSERT INTO assignments")) {
      const [id, course_id, teacher_id, title, instructions, due_at, points, allow_file, created_at, updated_at] = b;
      assignments.set(id, { id, course_id, teacher_id, title, instructions, due_at, points, allow_file, status: "open", created_at, updated_at });
      return { success: true };
    }
    if (sql.includes("UPDATE assignments SET status='closed'")) { assignments.get(b[1]).status = "closed"; return { success: true }; }
    if (sql.includes("UPDATE assignments SET status='open'")) { assignments.get(b[1]).status = "open"; return { success: true }; }
    if (sql.includes("DELETE FROM submissions WHERE assignment_id=?")) {
      for (const [id, s] of [...submissions.entries()]) if (s.assignment_id === b[0]) submissions.delete(id);
      return { success: true };
    }
    if (sql.includes("DELETE FROM assignments WHERE id=?")) { assignments.delete(b[0]); return { success: true }; }
    if (sql.includes("UPDATE assignments SET title=COALESCE")) {
      const [title, instructions, points, keepDue, newDue, allowFile, updated_at, id] = b;
      const a = assignments.get(id);
      if (title != null) a.title = title;
      if (instructions != null) a.instructions = instructions;
      if (points != null) a.points = points;
      if (!keepDue) a.due_at = newDue;
      if (allowFile != null) a.allow_file = allowFile;
      a.updated_at = updated_at;
      return { success: true };
    }
    if (sql.includes("INSERT INTO submissions")) {
      const [id, assignment_id, user_id, text_content, file_key, submitted_at, updated_at, late] = b;
      const existing = subByPair(assignment_id, user_id);
      if (existing) Object.assign(existing, { text_content, file_key, updated_at, late, status: "submitted" });
      else submissions.set(id, { id, assignment_id, user_id, text_content, file_key, submitted_at, updated_at, late, grade: null, feedback: null, graded_by: null, graded_at: null, status: "submitted" });
      return { success: true };
    }
    if (sql.includes("UPDATE submissions SET grade=?")) {
      const [grade, feedback, graded_by, graded_at, id] = b;
      const s = submissions.get(id);
      Object.assign(s, { grade, feedback, graded_by, graded_at, status: "graded" });
      return { success: true };
    }
    return { success: true };
  }
  function handleAll(sql: string, b: any[]) {
    if (sql.includes("FROM assignments a WHERE a.course_id=?")) {
      const list = [...assignments.values()].filter((a) => a.course_id === b[0]).map((a) => ({
        ...a, submitted_count: [...submissions.values()].filter((s) => s.assignment_id === a.id).length,
        graded_count: [...submissions.values()].filter((s) => s.assignment_id === a.id && s.status === "graded").length,
      }));
      return { results: list };
    }
    if (sql.includes("FROM assignments a LEFT JOIN submissions s")) {
      const [userId, courseId] = b;
      const list = [...assignments.values()].filter((a) => a.course_id === courseId && a.status !== "draft").map((a) => {
        const s = subByPair(a.id, userId);
        return { ...a, my_status: s ? s.status : null, my_grade: s ? s.grade : null, my_feedback: s ? s.feedback : null, my_submitted_at: s ? s.submitted_at : null, my_late: s ? s.late : null };
      });
      return { results: list };
    }
    if (sql.includes("FROM submissions sub JOIN users u")) {
      const list = [...submissions.values()].filter((s) => s.assignment_id === b[0]).map((s) => ({ ...s, email: users.get(s.user_id)?.email, name: users.get(s.user_id)?.name }));
      return { results: list };
    }
    return { results: [] };
  }
  function prepare(sql: string) {
    let bound: any[] = [];
    const self = {
      bind(...args: any[]) { bound = args; return self; },
      async first() { return handleFirst(sql, bound); },
      async run() { return handleRun(sql, bound); },
      async all() { return handleAll(sql, bound); },
    };
    return self;
  }
  return { prepare, users, sessions, courseTeachers, enrollments, assignments, submissions, media };
}

function makeEnv() { return { DB: fakeDB() }; }
function seedUser(env: any, { id, role = "learner" }: any) {
  env.DB.users.set(id, { id, email: id + "@example.com", name: id, role });
  env.DB.sessions.set("sid-" + id, { user_id: id, expires_at: Date.now() + 100000 });
}
function asReq(id: string | null, body?: unknown, url = "http://localhost/api/assignments") {
  return req({ url, cookie: id ? "sid-" + id : undefined, body });
}

describe("assignments — ownership + CRUD", () => {
  let env: any;
  beforeEach(() => {
    env = makeEnv();
    seedUser(env, { id: "t1", role: "teacher" });
    seedUser(env, { id: "t2", role: "teacher" });
    seedUser(env, { id: "student1", role: "learner" });
    env.DB.courseTeachers.add("t1|course-x");
    env.DB.enrollments.add("student1|course-x");
  });

  it("a teacher who doesn't own the course cannot create an assignment", async () => {
    const res = await assignPost({ request: asReq("t2", { courseId: "course-x", title: "HW1", instructions: "Do it" }), env });
    expect(res.status).toBe(403);
  });

  it("owning teacher creates, then closes, then reopens an assignment", async () => {
    const create = await assignPost({ request: asReq("t1", { courseId: "course-x", title: "HW1", instructions: "Do it" }), env });
    expect(create.status).toBe(200);
    const { id } = await create.json();

    await assignPost({ request: asReq("t1", { id, action: "close" }), env });
    expect(env.DB.assignments.get(id).status).toBe("closed");
    await assignPost({ request: asReq("t1", { id, action: "reopen" }), env });
    expect(env.DB.assignments.get(id).status).toBe("open");
  });

  it("a student not enrolled in the course is forbidden", async () => {
    seedUser(env, { id: "outsider", role: "learner" });
    await assignPost({ request: asReq("t1", { courseId: "course-x", title: "HW1", instructions: "Do it" }), env });
    const res = await assignGet({ request: req({ url: "http://localhost/api/assignments?courseId=course-x", cookie: "sid-outsider" }), env });
    expect(res.status).toBe(403);
  });

  it("an enrolled student sees the assignment with their own (empty) submission state", async () => {
    await assignPost({ request: asReq("t1", { courseId: "course-x", title: "HW1", instructions: "Do it" }), env });
    const res = await assignGet({ request: req({ url: "http://localhost/api/assignments?courseId=course-x", cookie: "sid-student1" }), env });
    const { assignments } = await res.json();
    expect(assignments).toHaveLength(1);
    expect(assignments[0].my_status).toBeNull();
  });
});

describe("submissions — resubmit, late flag, grading", () => {
  let env: any;
  let assignmentId: string;
  beforeEach(async () => {
    env = makeEnv();
    seedUser(env, { id: "t1", role: "teacher" });
    seedUser(env, { id: "student1", role: "learner" });
    env.DB.courseTeachers.add("t1|course-x");
    env.DB.enrollments.add("student1|course-x");
    const create = await assignPost({ request: asReq("t1", { courseId: "course-x", title: "HW1", instructions: "Do it", dueAt: Date.now() - 1000 }), env });
    assignmentId = (await create.json()).id;
  });

  it("a submission after the due date is flagged late", async () => {
    const res = await subPost({ request: asReq("student1", { assignmentId, text: "my answer" }, "http://localhost/api/submissions"), env });
    expect(res.status).toBe(200);
    expect((await res.json()).late).toBe(true);
  });

  it("resubmission overwrites the previous submission until it's graded", async () => {
    await subPost({ request: asReq("student1", { assignmentId, text: "draft 1" }, "http://localhost/api/submissions"), env });
    await subPost({ request: asReq("student1", { assignmentId, text: "draft 2" }, "http://localhost/api/submissions"), env });
    const mine = await subGet({ request: req({ url: `http://localhost/api/submissions?assignmentId=${assignmentId}&mine=1`, cookie: "sid-student1" }), env });
    expect((await mine.json()).submission.text_content).toBe("draft 2");
  });

  it("once graded, the student cannot resubmit", async () => {
    const submitRes = await subPost({ request: asReq("student1", { assignmentId, text: "final answer" }, "http://localhost/api/submissions"), env });
    const submissionId = [...env.DB.submissions.values()][0].id;
    await gradePost({ request: asReq("t1", { submissionId, grade: 90, feedback: "Nice" }, "http://localhost/api/submissions/grade"), env });

    const res = await subPost({ request: asReq("student1", { assignmentId, text: "trying to change it" }, "http://localhost/api/submissions"), env });
    expect(res.status).toBe(400);
  });

  it("grade is clamped to [0, points]", async () => {
    await subPost({ request: asReq("student1", { assignmentId, text: "x" }, "http://localhost/api/submissions"), env });
    const submissionId = [...env.DB.submissions.values()][0].id;
    const res = await gradePost({ request: asReq("t1", { submissionId, grade: 9999 }, "http://localhost/api/submissions/grade"), env });
    expect((await res.json()).grade).toBe(100); // default points cap
  });

  it("a teacher who doesn't own the course cannot grade", async () => {
    seedUser(env, { id: "t2", role: "teacher" });
    await subPost({ request: asReq("student1", { assignmentId, text: "x" }, "http://localhost/api/submissions"), env });
    const submissionId = [...env.DB.submissions.values()][0].id;
    const res = await gradePost({ request: asReq("t2", { submissionId, grade: 50 }, "http://localhost/api/submissions/grade"), env });
    expect(res.status).toBe(403);
  });

  it("a closed assignment rejects new submissions", async () => {
    await assignPost({ request: asReq("t1", { id: assignmentId, action: "close" }), env });
    const res = await subPost({ request: asReq("student1", { assignmentId, text: "too late" }, "http://localhost/api/submissions"), env });
    expect(res.status).toBe(400);
  });

  it("a file submission must be the student's own media_objects row tagged for this exact assignment", async () => {
    await assignPost({ request: asReq("t1", { id: assignmentId, allowFile: true }), env });
    env.DB.media.set("uploads/other/x.pdf", { owner_id: "someone-else", kind: "submission", context: `assignment:${assignmentId}` });
    const wrongOwner = await subPost({ request: asReq("student1", { assignmentId, fileKey: "uploads/other/x.pdf" }, "http://localhost/api/submissions"), env });
    expect(wrongOwner.status).toBe(400);

    env.DB.media.set("uploads/student1/x.pdf", { owner_id: "student1", kind: "submission", context: `assignment:${assignmentId}` });
    const ok = await subPost({ request: asReq("student1", { assignmentId, fileKey: "uploads/student1/x.pdf" }, "http://localhost/api/submissions"), env });
    expect(ok.status).toBe(200);
  });
});
