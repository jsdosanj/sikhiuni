import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { ensurePolicies } from "./course-policies.js";
import { itemLock } from "./release-rules.js";
import { cleanQuestion, permFor, learnerView, gradeQuestion, reviewOf, shuffled, cryptoRand } from "./_quiz-engine.js";

// C2 richer quizzes (Moodle Quiz): teacher-made course quizzes with seven question types,
// a question bank with random draws, attempt and time limits (accommodations add time),
// per-option feedback and review settings. Grading is server-side only and an attempt
// is graded as a whole, so the API never answers "is this one question right?" before
// the attempt is submitted (plan Part D.7). The existing course quiz is not touched.
//
// Teacher (course teacher/admin):
//   GET  ?courseId=          quizzes with attempt counts
//   GET  ?id=                full quiz incl. answers, attempts, per-question difficulty
//   POST { action:"create", courseId, title, description?, timeLimitMin?, maxAttempts?, drawCount?, review?, passPct? }
//   POST { action:"update", id, ...same fields }
//   POST { action:"questions", id, questions:[...] }     not once anyone has attempted it
//   POST { action:"status", id, status:"draft"|"open"|"closed" } | { action:"delete", id }
// Learner (enrolled):
//   GET  ?courseId=          open/closed quizzes with my attempts and best score
//   GET  ?attempt=           my attempt: questions (in progress) or result (per review setting)
//   POST { action:"start", id }                           resumes an unfinished attempt
//   POST { action:"save", attemptId, answers }            autosave while in progress
//   POST { action:"submit", attemptId, answers }
// review: "none" | "score" (default) | "answers" (correct answers right after submitting)
//         | "after_close" (correct answers once the teacher closes the quiz)

const GRACE_MS = 30 * 1000;
const REVIEWS = ["none", "score", "answers", "after_close"];

export function ensureQuizzes(env) {
  return schemaOnce(env.DB, "lms_quizzes", async () => {
    const run = (q) => env.DB.prepare(q).run();
    await run("CREATE TABLE IF NOT EXISTS lms_quizzes (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'draft', " +
      "time_limit_min INTEGER, max_attempts INTEGER, draw_count INTEGER, review TEXT NOT NULL DEFAULT 'score', pass_pct INTEGER, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    await run("CREATE INDEX IF NOT EXISTS idx_lms_quizzes_course ON lms_quizzes(course_id)");
    await run("CREATE TABLE IF NOT EXISTS lms_quiz_questions (id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, position INTEGER NOT NULL, type TEXT NOT NULL, prompt TEXT NOT NULL, data TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 1)");
    await run("CREATE INDEX IF NOT EXISTS idx_lms_quiz_questions_quiz ON lms_quiz_questions(quiz_id, position)");
    await run("CREATE TABLE IF NOT EXISTS lms_quiz_attempts (id TEXT PRIMARY KEY, quiz_id TEXT NOT NULL, course_id TEXT NOT NULL, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, deadline_at INTEGER, " +
      "submitted_at INTEGER, question_ids TEXT NOT NULL, perms TEXT NOT NULL, answers TEXT, score REAL, max_score REAL, results TEXT, status TEXT NOT NULL DEFAULT 'in_progress')");
    await run("CREATE INDEX IF NOT EXISTS idx_lms_quiz_attempts_user ON lms_quiz_attempts(quiz_id, user_id)");
  });
}

const intOrNull = (v, lo, hi) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
const loadQuestions = async (env, quizId) => ((await env.DB.prepare("SELECT id, type, prompt, data, points FROM lms_quiz_questions WHERE quiz_id=? ORDER BY position").bind(quizId).all()).results || [])
  .map((q) => ({ ...q, data: JSON.parse(q.data) }));
const pct = (s, m) => (m ? Math.round((s / m) * 1000) / 10 : 0);

/** Grade an attempt's answers against its drawn questions; stores and returns the result. */
async function finish(env, attempt, answers, now) {
  const qs = await loadQuestions(env, attempt.quiz_id);
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const ids = JSON.parse(attempt.question_ids), perms = JSON.parse(attempt.perms);
  let score = 0, max = 0;
  const results = {};
  for (const id of ids) {
    const q = byId[id]; if (!q) continue;
    const g = gradeQuestion(q, perms[id], answers ? answers[id] : undefined);
    score += g.earned; max += g.max;
    results[id] = { earned: Math.round(g.earned * 100) / 100, max: g.max, correct: g.correct };
  }
  score = Math.round(score * 100) / 100;
  await env.DB.prepare("UPDATE lms_quiz_attempts SET answers=?, score=?, max_score=?, results=?, submitted_at=?, status='submitted' WHERE id=? AND status='in_progress'")
    .bind(JSON.stringify(answers || {}), score, max, JSON.stringify(results), now, attempt.id).run();
  return { score, max, results };
}

/** Auto-submit an attempt whose time ran out, grading what was saved. */
async function settleIfExpired(env, a, now) {
  if (a.status === "in_progress" && a.deadline_at && now > a.deadline_at + GRACE_MS) {
    await finish(env, a, a.answers ? JSON.parse(a.answers) : {}, a.deadline_at);
    return await env.DB.prepare("SELECT * FROM lms_quiz_attempts WHERE id=?").bind(a.id).first();
  }
  return a;
}

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  await ensureQuizzes(env);
  const now = Date.now();

  const attemptId = sp.get("attempt");
  if (attemptId) {
    let a = await env.DB.prepare("SELECT * FROM lms_quiz_attempts WHERE id=?").bind(attemptId).first();
    if (!a) return json({ error: "not found" }, 404);
    const { user, error } = await courseAccess(env, request, a.course_id, "member");
    if (error) return error;
    if (a.user_id !== user.id) return json({ error: "forbidden" }, 403);
    a = await settleIfExpired(env, a, now);
    const quiz = await env.DB.prepare("SELECT * FROM lms_quizzes WHERE id=?").bind(a.quiz_id).first();
    const qs = await loadQuestions(env, a.quiz_id);
    const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
    const ids = JSON.parse(a.question_ids), perms = JSON.parse(a.perms);
    const answers = a.answers ? JSON.parse(a.answers) : {};
    if (a.status === "in_progress") {
      return json({ attempt: { id: a.id, quiz_id: a.quiz_id, title: quiz.title, status: a.status, deadline_at: a.deadline_at, now,
        questions: ids.filter((id) => byId[id]).map((id) => learnerView(byId[id], perms[id])), answers } });
    }
    const showScore = quiz.review !== "none";
    const showAnswers = quiz.review === "answers" || (quiz.review === "after_close" && quiz.status === "closed");
    const results = JSON.parse(a.results || "{}");
    return json({ attempt: { id: a.id, quiz_id: a.quiz_id, title: quiz.title, status: a.status, submitted_at: a.submitted_at,
      score: showScore ? a.score : null, max_score: showScore ? a.max_score : null, percent: showScore ? pct(a.score, a.max_score) : null,
      passed: showScore && quiz.pass_pct != null ? pct(a.score, a.max_score) >= quiz.pass_pct : null,
      review: showAnswers ? ids.filter((id) => byId[id]).map((id) => ({ ...learnerView(byId[id], perms[id]), your_answer: answers[id] ?? null, ...results[id], ...reviewOf(byId[id], perms[id], answers[id]) })) : null,
      review_note: showAnswers ? null : quiz.review === "after_close" ? "Correct answers appear when your teacher closes the quiz." : quiz.review === "none" ? "Your teacher will share results." : null } });
  }

  const id = sp.get("id");
  if (id) {
    const quiz = await env.DB.prepare("SELECT * FROM lms_quizzes WHERE id=?").bind(id).first();
    if (!quiz) return json({ error: "not found" }, 404);
    const { error } = await courseAccess(env, request, quiz.course_id, "teacher");
    if (error) return error;
    const qs = await loadQuestions(env, id);
    const { results } = await env.DB.prepare("SELECT a.user_id, a.score, a.max_score, a.results, a.status, a.submitted_at, u.name, u.email FROM lms_quiz_attempts a LEFT JOIN users u ON u.id=a.user_id WHERE a.quiz_id=? ORDER BY a.started_at").bind(id).all();
    // Item difficulty: share of the available points learners earned on each question.
    const stats = Object.fromEntries(qs.map((q) => [q.id, { earned: 0, max: 0, seen: 0 }]));
    const byLearner = {};
    for (const r of results || []) {
      if (r.status !== "submitted") continue;
      for (const [qid, g] of Object.entries(JSON.parse(r.results || "{}"))) if (stats[qid]) { stats[qid].earned += g.earned; stats[qid].max += g.max; stats[qid].seen++; }
      const k = r.user_id; const p = pct(r.score, r.max_score);
      if (!byLearner[k] || p > byLearner[k].best) byLearner[k] = { name: r.name || r.email, best: p, attempts: (byLearner[k] ? byLearner[k].attempts : 0) + 1 };
      else byLearner[k].attempts++;
    }
    return json({ quiz, questions: qs.map((q) => ({ ...q, difficulty: stats[q.id].max ? pct(stats[q.id].earned, stats[q.id].max) : null, answered: stats[q.id].seen })),
      learners: Object.values(byLearner), attempts: (results || []).length });
  }

  const courseId = sp.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  if (teach) {
    const { results } = await env.DB.prepare("SELECT q.id, q.title, q.status, q.time_limit_min, q.max_attempts, q.draw_count, q.review, q.pass_pct, " +
      "(SELECT COUNT(*) FROM lms_quiz_questions x WHERE x.quiz_id=q.id) AS questions, (SELECT COUNT(*) FROM lms_quiz_attempts a WHERE a.quiz_id=q.id AND a.status='submitted') AS attempts " +
      "FROM lms_quizzes q WHERE q.course_id=? ORDER BY q.created_at DESC").bind(courseId).all();
    return json({ scope: "teacher", quizzes: results || [] });
  }
  const { results } = await env.DB.prepare("SELECT id, title, description, status, time_limit_min, max_attempts, review, pass_pct FROM lms_quizzes WHERE course_id=? AND status<>'draft' ORDER BY created_at DESC").bind(courseId).all();
  const out = [];
  for (const q of results || []) {
    const mine = ((await env.DB.prepare("SELECT id, status, score, max_score, deadline_at, answers, quiz_id, perms, question_ids FROM lms_quiz_attempts WHERE quiz_id=? AND user_id=? ORDER BY started_at").bind(q.id, user.id).all()).results) || [];
    const settled = [];
    for (const a of mine) settled.push(await settleIfExpired(env, a, now));
    const done = settled.filter((a) => a.status === "submitted");
    const open = settled.find((a) => a.status === "in_progress");
    const lock = await itemLock(env, "quiz", q.id, courseId, user.id);
    out.push({ ...q, attempts_used: done.length, in_progress: open ? open.id : null, last_attempt: done.length ? done[done.length - 1].id : null,
      best: q.review === "none" || !done.length ? null : Math.max(...done.map((a) => pct(a.score, a.max_score))), locked: !!lock, lock_reason: lock });
  }
  return json({ scope: "learner", quizzes: out });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensureQuizzes(env);
  const now = Date.now();

  if (b.action === "save" || b.action === "submit") {
    let a = await env.DB.prepare("SELECT * FROM lms_quiz_attempts WHERE id=?").bind(String(b.attemptId || "")).first();
    if (!a) return json({ error: "not found" }, 404);
    const { user, error } = await courseAccess(env, request, a.course_id, "member");
    if (error) return error;
    if (a.user_id !== user.id) return json({ error: "forbidden" }, 403);
    if (a.status !== "in_progress") return json({ error: "This attempt has already been submitted." }, 409);
    const answers = b.answers && typeof b.answers === "object" ? b.answers : {};
    if (JSON.stringify(answers).length > 50000) return json({ error: "Answers are too long." }, 400);
    const expired = a.deadline_at && now > a.deadline_at + GRACE_MS;
    if (b.action === "save") {
      if (expired) { await settleIfExpired(env, a, now); return json({ error: "Time is up; your saved answers were submitted." }, 409); }
      await env.DB.prepare("UPDATE lms_quiz_attempts SET answers=? WHERE id=? AND status='in_progress'").bind(JSON.stringify(answers), a.id).run();
      return json({ ok: true });
    }
    // After time runs out, only what was saved in time counts.
    const r = await finish(env, a, expired ? (a.answers ? JSON.parse(a.answers) : {}) : answers, expired ? a.deadline_at : now);
    await logEvent(env, user, "quiz_attempt_submitted", a.quiz_id, `${r.score}/${r.max}${expired ? " (time expired)" : ""}`, { targetType: "quiz" });
    return json({ ok: true, attemptId: a.id, expired: !!expired });
  }

  if (b.action === "create") {
    const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
    if (error) return error;
    const title = cleanText(b.title, 200);
    if (!title) return json({ error: "Give the quiz a title." }, 400);
    const id = newId();
    await env.DB.prepare("INSERT INTO lms_quizzes (id, course_id, title, description, status, time_limit_min, max_attempts, draw_count, review, pass_pct, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, b.courseId, title, cleanText(b.description, 2000) || null, "draft", intOrNull(b.timeLimitMin, 1, 600), intOrNull(b.maxAttempts, 1, 50), intOrNull(b.drawCount, 1, 200),
        REVIEWS.includes(b.review) ? b.review : "score", intOrNull(b.passPct, 0, 100), user.id, now, now).run();
    await logEvent(env, user, "quiz_created", id, title, { targetType: "quiz" });
    return json({ ok: true, id });
  }

  const quiz = b.id ? await env.DB.prepare("SELECT * FROM lms_quizzes WHERE id=?").bind(String(b.id)).first() : null;
  if (!quiz) return json({ error: "not found" }, 404);

  if (b.action === "start") {
    const { user, teach, error } = await courseAccess(env, request, quiz.course_id, "member");
    if (error) return error;
    if (teach) return json({ error: "Teachers preview quizzes from the quiz editor." }, 400);
    if (quiz.status !== "open") return json({ error: "This quiz isn't open." }, 400);
    const lock = await itemLock(env, "quiz", quiz.id, quiz.course_id, user.id);
    if (lock) return json({ error: lock }, 403);
    const mine = ((await env.DB.prepare("SELECT * FROM lms_quiz_attempts WHERE quiz_id=? AND user_id=? ORDER BY started_at").bind(quiz.id, user.id).all()).results) || [];
    for (const a of mine) {
      const s = await settleIfExpired(env, a, now);
      if (s.status === "in_progress") return json({ ok: true, attemptId: s.id, resumed: true });
    }
    if (quiz.max_attempts && mine.length >= quiz.max_attempts) return json({ error: "You have used all your attempts." }, 403);
    const qs = await loadQuestions(env, quiz.id);
    if (!qs.length) return json({ error: "This quiz has no questions yet." }, 400);
    // Question bank: draw a random subset when the teacher set one; otherwise all, shuffled.
    const order = shuffled(qs.length, cryptoRand).map((i) => qs[i]);
    const drawn = quiz.draw_count && quiz.draw_count < qs.length ? order.slice(0, quiz.draw_count) : order;
    const perms = Object.fromEntries(drawn.map((q) => [q.id, permFor(q)]));
    let deadline = null;
    if (quiz.time_limit_min) {
      await ensurePolicies(env);
      const acc = await env.DB.prepare("SELECT extra_time_pct FROM course_accommodations WHERE course_id=? AND user_id=?").bind(quiz.course_id, user.id).first();
      deadline = now + Math.round(quiz.time_limit_min * 60000 * (1 + ((acc && acc.extra_time_pct) || 0) / 100));
    }
    const id = newId();
    await env.DB.prepare("INSERT INTO lms_quiz_attempts (id, quiz_id, course_id, user_id, started_at, deadline_at, question_ids, perms, answers, status) VALUES (?,?,?,?,?,?,?,?,?,'in_progress')")
      .bind(id, quiz.id, quiz.course_id, user.id, now, deadline, JSON.stringify(drawn.map((q) => q.id)), JSON.stringify(perms), "{}").run();
    return json({ ok: true, attemptId: id });
  }

  const { user, error } = await courseAccess(env, request, quiz.course_id, "teacher");
  if (error) return error;
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM lms_quiz_attempts WHERE quiz_id=?").bind(quiz.id).run();
    await env.DB.prepare("DELETE FROM lms_quiz_questions WHERE quiz_id=?").bind(quiz.id).run();
    await env.DB.prepare("DELETE FROM lms_quizzes WHERE id=?").bind(quiz.id).run();
    await logEvent(env, user, "quiz_deleted", quiz.id, quiz.title, { targetType: "quiz" });
    return json({ ok: true });
  }
  if (b.action === "status") {
    if (!["draft", "open", "closed"].includes(b.status)) return json({ error: "bad status" }, 400);
    if (b.status === "open") {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM lms_quiz_questions WHERE quiz_id=?").bind(quiz.id).first();
      if (!n || !n.n) return json({ error: "Add questions before opening the quiz." }, 400);
    }
    await env.DB.prepare("UPDATE lms_quizzes SET status=?, updated_at=? WHERE id=?").bind(b.status, now, quiz.id).run();
    await logEvent(env, user, "quiz_updated", quiz.id, `status=${b.status}`, { targetType: "quiz", before: { status: quiz.status }, after: { status: b.status } });
    return json({ ok: true });
  }
  if (b.action === "update") {
    await env.DB.prepare("UPDATE lms_quizzes SET title=COALESCE(?,title), description=?, time_limit_min=?, max_attempts=?, draw_count=?, review=?, pass_pct=?, updated_at=? WHERE id=?")
      .bind(cleanText(b.title, 200) || null, b.description !== undefined ? cleanText(b.description, 2000) || null : quiz.description,
        b.timeLimitMin !== undefined ? intOrNull(b.timeLimitMin, 1, 600) : quiz.time_limit_min, b.maxAttempts !== undefined ? intOrNull(b.maxAttempts, 1, 50) : quiz.max_attempts,
        b.drawCount !== undefined ? intOrNull(b.drawCount, 1, 200) : quiz.draw_count, REVIEWS.includes(b.review) ? b.review : quiz.review,
        b.passPct !== undefined ? intOrNull(b.passPct, 0, 100) : quiz.pass_pct, now, quiz.id).run();
    await logEvent(env, user, "quiz_updated", quiz.id, null, { targetType: "quiz", before: { time_limit_min: quiz.time_limit_min, max_attempts: quiz.max_attempts, review: quiz.review, pass_pct: quiz.pass_pct } });
    return json({ ok: true });
  }
  if (b.action === "questions") {
    const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM lms_quiz_attempts WHERE quiz_id=?").bind(quiz.id).first();
    if (used && used.n) return json({ error: "Questions can't change after learners have attempted the quiz. Make a copy instead." }, 409);
    if (!Array.isArray(b.questions) || !b.questions.length) return json({ error: "Add at least one question." }, 400);
    if (b.questions.length > 200) return json({ error: "At most 200 questions." }, 400);
    const cleaned = [];
    for (let i = 0; i < b.questions.length; i++) {
      const q = cleanQuestion(b.questions[i], i);
      if (typeof q === "string") return json({ error: q }, 400);
      cleaned.push(q);
    }
    await env.DB.prepare("DELETE FROM lms_quiz_questions WHERE quiz_id=?").bind(quiz.id).run();
    for (let i = 0; i < cleaned.length; i++) {
      const q = cleaned[i];
      await env.DB.prepare("INSERT INTO lms_quiz_questions (id, quiz_id, position, type, prompt, data, points) VALUES (?,?,?,?,?,?,?)")
        .bind(newId().slice(0, 16), quiz.id, i, q.type, q.prompt, JSON.stringify(q.data), q.points).run();
    }
    await env.DB.prepare("UPDATE lms_quizzes SET updated_at=? WHERE id=?").bind(now, quiz.id).run();
    await logEvent(env, user, "quiz_updated", quiz.id, `${cleaned.length} questions`, { targetType: "quiz" });
    return json({ ok: true, count: cleaned.length });
  }
  return json({ error: "unknown action" }, 400);
}
