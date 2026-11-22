import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { ensureAssignments } from "./assignments.js";
import { ensurePolicies } from "./course-policies.js";
import { ensureRubrics, cleanCriteria } from "./rubrics.js";
import { ensureQuizzes } from "./lms-quizzes.js";
import { cleanQuestion } from "./_quiz-engine.js";
import { ensurePolls, cleanQuestions as cleanPollQuestions } from "./polls.js";
import { ensureGlossary } from "./glossary.js";

// C16 course copy / import-export (Moodle backup, Common Cartridge in spirit). A teacher
// downloads a course's teaching tools as one JSON package and imports it into another
// course they teach. Lesson content is NOT in the package: lessons go through Sikhi
// Studio and scholar review, never through this route.
//
// In the package: assignments (with late policy and rubric), rubrics, course quizzes
// (with answer keys, so the file is teacher-only), polls/surveys, glossary terms.
// Never in it: learner data of any kind (submissions, grades, attempts, responses,
// journals, attendance), badges or release rules (they act on learners immediately).
//
// Import rules (CLAUDE.md, CONTENT-AND-LICENSING):
//   - the importer must state the rights basis: "own" (Sikhi University's or the
//     teacher's own material), "cc" (a Creative Commons licence that allows adaptation,
//     with attribution, which is added to every imported item), or "permission"
//     (written permission: from whom, and a reference). ND licences are refused because
//     imported items are editable.
//   - everything with a status arrives as a DRAFT (assignments, quizzes, polls), so
//     nothing reaches learners until the teacher has checked and opened it;
//   - a package marked ai_created labels every item "Created by AI." for review;
//   - every import is recorded in course_imports (licensing register) and the audit log.
//
// GET  /api/course-package?courseId=          teacher: download the package
// GET  /api/course-package?courseId=&log=1    teacher: past imports into this course
// POST { courseId, package, rights, confirm? } teacher: without confirm, a preview
//                                             (counts + problems); with it, the import

export const FORMAT = "sikhiuni-course-package";
const MAX = { assignments: 200, rubrics: 100, quizzes: 100, polls: 100, glossary: 2000 };
const MAX_BYTES = 2_000_000;
const CC_OK = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0"];
const AI_LABEL = "Created by AI.";

export function ensureImports(env) {
  return schemaOnce(env.DB, "course_imports", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS course_imports (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, imported_by TEXT, imported_at INTEGER NOT NULL, " +
      "source TEXT, basis TEXT NOT NULL, licence TEXT, attribution TEXT, permission_from TEXT, permission_ref TEXT, ai_created INTEGER NOT NULL DEFAULT 0, counts TEXT NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_course_imports_course ON course_imports(course_id)").run();
  });
}

const rows = async (env, sql, ...a) => { try { return (await env.DB.prepare(sql).bind(...a).all()).results || []; } catch { return []; } };
const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/** Build the package for a course. Teacher-only: quiz answer keys are included. */
export async function buildPackage(env, courseId) {
  await Promise.all([ensureAssignments(env), ensurePolicies(env), ensureRubrics(env), ensureQuizzes(env), ensurePolls(env), ensureGlossary(env)]);
  const rubrics = await rows(env, "SELECT id, title, criteria FROM rubrics WHERE course_id=? ORDER BY created_at", courseId);
  const rubricKey = Object.fromEntries(rubrics.map((r, i) => [r.id, "r" + i]));
  const assignments = await rows(env,
    "SELECT a.id, a.title, a.instructions, a.points, a.allow_file, p.late_penalty_per_day, p.max_late_days, ar.rubric_id FROM assignments a " +
    "LEFT JOIN assignment_policies p ON p.assignment_id=a.id LEFT JOIN assignment_rubrics ar ON ar.assignment_id=a.id WHERE a.course_id=? ORDER BY a.created_at", courseId);
  const quizzes = await rows(env, "SELECT id, title, description, time_limit_min, max_attempts, draw_count, review, pass_pct FROM lms_quizzes WHERE course_id=? ORDER BY created_at", courseId);
  const questions = await rows(env, "SELECT q.quiz_id, q.type, q.prompt, q.data, q.points FROM lms_quiz_questions q JOIN lms_quizzes z ON z.id=q.quiz_id WHERE z.course_id=? ORDER BY q.quiz_id, q.position", courseId);
  const polls = await rows(env, "SELECT kind, title, anonymous, questions FROM polls WHERE course_id=? ORDER BY created_at", courseId);
  const glossary = await rows(env, "SELECT term, term_gur, definition FROM glossary_terms WHERE course_id=? ORDER BY term COLLATE NOCASE", courseId);
  return {
    format: FORMAT, version: 1, exported_at: new Date().toISOString(), source: { site: "sikhiuni.com", course_id: courseId },
    note: "Teacher-only: contains quiz answer keys. Holds no learner data. Lesson content is not included.",
    rubrics: rubrics.map((r) => ({ key: rubricKey[r.id], title: r.title, criteria: parse(r.criteria, []) })),
    assignments: assignments.map((a) => ({
      title: a.title, instructions: a.instructions, points: a.points, allow_file: !!a.allow_file,
      late_penalty_per_day: a.late_penalty_per_day || 0, max_late_days: a.max_late_days == null ? null : a.max_late_days,
      rubric: a.rubric_id && rubricKey[a.rubric_id] ? rubricKey[a.rubric_id] : null,
    })),
    quizzes: quizzes.map((z) => ({
      title: z.title, description: z.description, time_limit_min: z.time_limit_min, max_attempts: z.max_attempts, draw_count: z.draw_count, review: z.review, pass_pct: z.pass_pct,
      questions: questions.filter((q) => q.quiz_id === z.id).map((q) => ({ type: q.type, prompt: q.prompt, data: parse(q.data, {}), points: q.points })),
    })),
    polls: polls.map((p) => ({ kind: p.kind, title: p.title, anonymous: !!p.anonymous, questions: parse(p.questions, []) })),
    glossary: glossary.map((g) => ({ term: g.term, term_gur: g.term_gur, definition: g.definition })),
  };
}

/** Rights statement -> cleaned record, or an error string. */
export function cleanRights(r) {
  r = r && typeof r === "object" ? r : {};
  if (r.basis === "own") return { basis: "own", note: null };
  if (r.basis === "cc") {
    const licence = String(r.licence || "");
    if (/-ND\b|-ND-/.test(licence)) return "No-derivatives (ND) licences don't allow imported items to be edited, so they can't be imported.";
    if (!CC_OK.includes(licence)) return "Choose the Creative Commons licence the material is under.";
    const attribution = cleanText(r.attribution, 300);
    if (licence !== "CC0-1.0" && !attribution) return "Write the attribution the licence requires: the author and where the material comes from.";
    return { basis: "cc", licence, attribution: attribution || null, note: licence === "CC0-1.0" ? null : `Adapted from ${attribution}, licensed ${licence.replace(/-4\.0$/, " 4.0").replace(/-/g, " ")}.` };
  }
  if (r.basis === "permission") {
    const from = cleanText(r.permissionFrom, 200), ref = cleanText(r.permissionRef, 300);
    if (!from || !ref) return "Say who gave written permission and where it is recorded (for example the email date and subject).";
    return { basis: "permission", permissionFrom: from, permissionRef: ref, note: `Used with permission from ${from}.` };
  }
  return "Say what rights you have to this material.";
}

const int = (v, lo, hi) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const list = (v) => (Array.isArray(v) ? v : []);

/** Validate a package. Returns { items, problems } where items are ready to insert. */
export function validatePackage(pkg) {
  const problems = [];
  if (!pkg || typeof pkg !== "object" || pkg.format !== FORMAT || pkg.version !== 1) return { items: null, problems: ["This isn't a Sikhi University course package (version 1)."] };
  for (const [k, n] of Object.entries(MAX)) if (list(pkg[k]).length > n) problems.push(`Too many ${k}: at most ${n}.`);
  if (problems.length) return { items: null, problems };
  const items = { rubrics: [], assignments: [], quizzes: [], polls: [], glossary: [] };
  const keys = new Set();
  list(pkg.rubrics).forEach((r, i) => {
    const title = cleanText(r && r.title, 160), criteria = cleanCriteria(r && r.criteria);
    if (!title || typeof criteria === "string") { problems.push(`Rubric ${i + 1}: ${title ? criteria : "missing title"}`); return; }
    const key = String(r.key || "r" + i).slice(0, 20); keys.add(key);
    items.rubrics.push({ key, title, criteria });
  });
  list(pkg.assignments).forEach((a, i) => {
    const title = cleanText(a && a.title, 200), instructions = cleanText(a && a.instructions, 4000);
    if (!title || !instructions) { problems.push(`Assignment ${i + 1}: needs a title and instructions.`); return; }
    items.assignments.push({ title, instructions, points: int(a.points, 1, 1000) || 100, allowFile: !!a.allow_file, penalty: int(a.late_penalty_per_day, 0, 100) || 0, maxLate: int(a.max_late_days, 0, 365), rubric: a.rubric && keys.has(String(a.rubric)) ? String(a.rubric) : null });
  });
  list(pkg.quizzes).forEach((z, i) => {
    const title = cleanText(z && z.title, 200);
    if (!title) { problems.push(`Quiz ${i + 1}: missing title.`); return; }
    const qs = list(z.questions);
    if (qs.length > 200) { problems.push(`Quiz "${title}": at most 200 questions.`); return; }
    const cleaned = [];
    for (let j = 0; j < qs.length; j++) { const q = cleanQuestion(qs[j], j); if (typeof q === "string") { problems.push(`Quiz "${title}": ${q}`); return; } cleaned.push(q); }
    items.quizzes.push({ title, description: cleanText(z.description, 2000) || null, timeLimit: int(z.time_limit_min, 1, 600), maxAttempts: int(z.max_attempts, 1, 50), drawCount: int(z.draw_count, 1, 200),
      review: ["none", "score", "answers", "after_close"].includes(z.review) ? z.review : "score", passPct: int(z.pass_pct, 0, 100), questions: cleaned });
  });
  list(pkg.polls).forEach((p, i) => {
    const title = cleanText(p && p.title, 200), qs = cleanPollQuestions(p && p.questions);
    if (!title || typeof qs === "string") { problems.push(`Poll ${i + 1}: ${title ? qs : "missing title"}`); return; }
    items.polls.push({ kind: ["poll", "survey", "evaluation"].includes(p.kind) ? p.kind : "poll", title, anonymous: !!p.anonymous, questions: qs });
  });
  list(pkg.glossary).forEach((g, i) => {
    const term = cleanText(g && g.term, 120), definition = cleanText(g && g.definition, 3000);
    if (!term || !definition) { problems.push(`Glossary term ${i + 1}: needs a term and a definition.`); return; }
    items.glossary.push({ term, termGur: cleanText(g.term_gur, 120) || null, definition });
  });
  return { items, problems };
}

const counts = (it) => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, v.length]));

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  const courseId = sp.get("courseId");
  const { user, error } = await courseAccess(env, request, courseId, "teacher");
  if (error) return error;
  if (sp.get("log")) {
    await ensureImports(env);
    const imports = await rows(env, "SELECT i.imported_at, i.source, i.basis, i.licence, i.attribution, i.permission_from, i.permission_ref, i.ai_created, i.counts, u.name AS by_name FROM course_imports i LEFT JOIN users u ON u.id=i.imported_by WHERE i.course_id=? ORDER BY i.imported_at DESC LIMIT 100", courseId);
    return json({ imports: imports.map((r) => ({ ...r, counts: parse(r.counts, {}) })) });
  }
  const pkg = await buildPackage(env, courseId);
  await logEvent(env, user, "course_exported", courseId, JSON.stringify(counts({ rubrics: pkg.rubrics, assignments: pkg.assignments, quizzes: pkg.quizzes, polls: pkg.polls, glossary: pkg.glossary })), { targetType: "course" });
  return json(pkg, 200, { "content-disposition": `attachment; filename="${courseId}-course-package.json"`, "cache-control": "no-store" });
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ error: "That package is too large (2 MB at most)." }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
  if (error) return error;
  const { items, problems } = validatePackage(b.package);
  const rights = cleanRights(b.rights);
  if (!items) return json({ error: problems[0], problems }, 400);
  const aiCreated = !!(b.package && b.package.ai_created);
  const summary = { counts: counts(items), problems, aiCreated, source: b.package.source || null };
  if (!b.confirm) return json({ preview: true, ...summary, rights: typeof rights === "string" ? { error: rights } : rights });
  if (typeof rights === "string") return json({ error: rights }, 400);
  if (problems.length) return json({ error: "Fix the problems listed before importing.", problems }, 400);

  await Promise.all([ensureAssignments(env), ensurePolicies(env), ensureRubrics(env), ensureQuizzes(env), ensurePolls(env), ensureGlossary(env), ensureImports(env)]);
  const now = Date.now(), courseId = b.courseId;
  const label = (text) => [aiCreated ? AI_LABEL : null, text, rights.note].filter(Boolean).join("\n\n");
  const rubricIds = {};
  for (const r of items.rubrics) {
    const id = newId(); rubricIds[r.key] = id;
    await env.DB.prepare("INSERT INTO rubrics (id, course_id, title, criteria, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").bind(id, courseId, r.title, JSON.stringify(r.criteria), user.id, now, now).run();
  }
  for (const a of items.assignments) {
    const id = newId();
    await env.DB.prepare("INSERT INTO assignments (id, course_id, teacher_id, title, instructions, due_at, points, allow_file, status, created_at, updated_at) VALUES (?,?,?,?,?,NULL,?,?,'draft',?,?)")
      .bind(id, courseId, user.id, a.title, label(a.instructions).slice(0, 4600), a.points, a.allowFile ? 1 : 0, now, now).run();
    if (a.penalty || a.maxLate != null) await env.DB.prepare("INSERT INTO assignment_policies (assignment_id, late_penalty_per_day, max_late_days, updated_at) VALUES (?,?,?,?)").bind(id, a.penalty, a.maxLate, now).run();
    if (a.rubric && rubricIds[a.rubric]) await env.DB.prepare("INSERT INTO assignment_rubrics (assignment_id, rubric_id) VALUES (?,?)").bind(id, rubricIds[a.rubric]).run();
  }
  for (const z of items.quizzes) {
    const id = newId();
    await env.DB.prepare("INSERT INTO lms_quizzes (id, course_id, title, description, status, time_limit_min, max_attempts, draw_count, review, pass_pct, created_by, created_at, updated_at) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?)")
      .bind(id, courseId, z.title, label(z.description) || null, z.timeLimit, z.maxAttempts, z.drawCount, z.review, z.passPct, user.id, now, now).run();
    for (let i = 0; i < z.questions.length; i++) {
      const q = z.questions[i];
      await env.DB.prepare("INSERT INTO lms_quiz_questions (id, quiz_id, position, type, prompt, data, points) VALUES (?,?,?,?,?,?,?)").bind(newId().slice(0, 16), id, i, q.type, q.prompt, JSON.stringify(q.data), q.points).run();
    }
  }
  for (const p of items.polls) {
    await env.DB.prepare("INSERT INTO polls (id, course_id, kind, title, anonymous, status, closes_at, questions, created_by, created_at, updated_at) VALUES (?,?,?,?,?,'draft',NULL,?,?,?,?)")
      .bind(newId(), courseId, p.kind, ((aiCreated ? AI_LABEL + " " : "") + p.title).slice(0, 220), p.anonymous ? 1 : 0, JSON.stringify(p.questions), user.id, now, now).run();
  }
  for (const g of items.glossary) {
    await env.DB.prepare("INSERT INTO glossary_terms (id, course_id, term, term_gur, definition, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(newId(), courseId, g.term, g.termGur, label(g.definition).slice(0, 3600), user.id, now, now).run();
  }
  const source = b.package.source && b.package.source.course_id ? `${cleanText(b.package.source.site, 80) || "?"}/${cleanText(b.package.source.course_id, 120)}` : null;
  await env.DB.prepare("INSERT INTO course_imports (id, course_id, imported_by, imported_at, source, basis, licence, attribution, permission_from, permission_ref, ai_created, counts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(newId(), courseId, user.id, now, source, rights.basis, rights.licence || null, rights.attribution || null, rights.permissionFrom || null, rights.permissionRef || null, aiCreated ? 1 : 0, JSON.stringify(summary.counts)).run();
  await logEvent(env, user, "course_imported", courseId, `${rights.basis}${source ? " from " + source : ""}: ${JSON.stringify(summary.counts)}`, { targetType: "course", after: summary.counts });
  return json({ ok: true, ...summary });
}
