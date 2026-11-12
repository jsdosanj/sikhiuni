import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { rubricForAssignment, scoreRubric } from "./rubrics.js";
import { filterText, getSettings } from "./_messaging.js";
import { notify } from "./_notify.js";
import { shuffled, cryptoRand } from "./_quiz-engine.js";

// C9 peer review (Canvas Peer Reviews, Moodle Workshop). Feedback only: peer reviews
// never change a grade; the teacher grades as before.
// - The teacher opens peer review on an assignment once learners have submitted. Each
//   submitter is given N classmates' submissions (a shuffled ring, so everyone gives and
//   gets the same number, never their own).
// - Anonymous by default: reviewers don't see whose work it is, authors don't see who
//   reviewed it. Teachers see everything and can hide a review.
// - Reviews use the assignment's rubric when it has one, plus a written comment.
//
// Teacher: GET ?assignmentId= (settings + every review)
//          POST { action:"start", assignmentId, perLearner (1-5), anonymous? } | { action:"close", assignmentId } | { action:"hide", reviewId }
// Learner: GET ?assignmentId= (reviews to write; reviews received once they've written theirs)
//          GET ?courseId=     (assignments with peer review open for me)
//          POST { action:"submit", reviewId, comment, rubricScores? }

const MIN_COMMENT = 20;

export function ensurePeer(env) {
  return schemaOnce(env.DB, "peer_reviews", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS peer_review_settings (assignment_id TEXT PRIMARY KEY, course_id TEXT NOT NULL, reviews_per_learner INTEGER NOT NULL, " +
      "anonymous INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'open', opened_at INTEGER NOT NULL, updated_by TEXT)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS peer_reviews (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, course_id TEXT NOT NULL, reviewer_id TEXT NOT NULL, submission_id TEXT NOT NULL, " +
      "status TEXT NOT NULL DEFAULT 'assigned', rubric_scores TEXT, comment TEXT, hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, submitted_at INTEGER, UNIQUE (reviewer_id, submission_id))").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_peer_reviews_assignment ON peer_reviews(assignment_id)").run();
  });
}

/** Ring allocation: after shuffling, reviewer i reviews the next N people round the ring. */
export function allocate(submissions, perLearner, rand = cryptoRand) {
  const order = shuffled(submissions.length, rand).map((i) => submissions[i]);
  const n = order.length, out = [];
  for (let i = 0; i < n; i++) for (let k = 1; k <= perLearner; k++) out.push({ reviewer_id: order[i].user_id, submission_id: order[(i + k) % n].id });
  return out;
}

async function assignmentOf(env, id) {
  return env.DB.prepare("SELECT id, course_id, title FROM assignments WHERE id=?").bind(String(id || "")).first().catch(() => null);
}

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  await ensurePeer(env);
  const courseIdParam = sp.get("courseId");
  if (courseIdParam) {
    const { user, error } = await courseAccess(env, request, courseIdParam, "member");
    if (error) return error;
    const { results } = await env.DB.prepare(
      "SELECT a.id, a.title, s.status, (SELECT COUNT(*) FROM peer_reviews r WHERE r.assignment_id=a.id AND r.reviewer_id=?) AS assigned, " +
      "(SELECT COUNT(*) FROM peer_reviews r WHERE r.assignment_id=a.id AND r.reviewer_id=? AND r.status='done') AS done " +
      "FROM peer_review_settings s JOIN assignments a ON a.id=s.assignment_id WHERE s.course_id=? ORDER BY s.opened_at DESC").bind(user.id, user.id, courseIdParam).all();
    return json({ assignments: results || [] });
  }
  const a = await assignmentOf(env, sp.get("assignmentId"));
  if (!a) return json({ error: "not found" }, 404);
  const { user, teach, error } = await courseAccess(env, request, a.course_id, "member");
  if (error) return error;
  const settings = await env.DB.prepare("SELECT reviews_per_learner, anonymous, status, opened_at FROM peer_review_settings WHERE assignment_id=?").bind(a.id).first();
  const rubric = await rubricForAssignment(env, a.id);
  if (teach) {
    const { results } = await env.DB.prepare(
      "SELECT r.id, r.status, r.comment, r.rubric_scores, r.hidden, r.submitted_at, rv.name AS reviewer, au.name AS author FROM peer_reviews r " +
      "JOIN submissions s ON s.id=r.submission_id LEFT JOIN users rv ON rv.id=r.reviewer_id LEFT JOIN users au ON au.id=s.user_id WHERE r.assignment_id=? ORDER BY au.name").bind(a.id).all();
    return json({ scope: "teacher", title: a.title, settings, rubric, reviews: (results || []).map((r) => ({ ...r, rubric_scores: r.rubric_scores ? JSON.parse(r.rubric_scores) : null })) });
  }
  if (!settings) return json({ scope: "learner", title: a.title, settings: null, to_review: [], received: [] });
  const mine = (await env.DB.prepare(
    "SELECT r.id, r.status, r.comment, r.rubric_scores, s.text_content, s.user_id AS author_id, au.name AS author FROM peer_reviews r JOIN submissions s ON s.id=r.submission_id " +
    "LEFT JOIN users au ON au.id=s.user_id WHERE r.assignment_id=? AND r.reviewer_id=? ORDER BY r.created_at").bind(a.id, user.id).all()).results || [];
  const to_review = mine.map((r, i) => ({ id: r.id, status: r.status, label: settings.anonymous ? `Classmate ${i + 1}` : r.author || "Classmate", text: r.text_content || "",
    comment: r.comment, rubric_scores: r.rubric_scores ? JSON.parse(r.rubric_scores) : null }));
  // Reviews of my work, once I've done my own share (so no one waits to copy others' feedback).
  const doneMine = mine.length > 0 && mine.every((r) => r.status === "done");
  let received = [];
  if (doneMine || settings.status === "closed") {
    received = ((await env.DB.prepare(
      "SELECT r.comment, r.rubric_scores, rv.name AS reviewer FROM peer_reviews r JOIN submissions s ON s.id=r.submission_id LEFT JOIN users rv ON rv.id=r.reviewer_id " +
      "WHERE r.assignment_id=? AND s.user_id=? AND r.status='done' AND r.hidden=0 ORDER BY r.submitted_at").bind(a.id, user.id).all()).results || [])
      .map((r, i) => ({ reviewer: settings.anonymous ? `Classmate ${i + 1}` : r.reviewer || "Classmate", comment: r.comment, rubric_scores: r.rubric_scores ? JSON.parse(r.rubric_scores) : null }));
  }
  return json({ scope: "learner", title: a.title, settings: { status: settings.status, anonymous: !!settings.anonymous }, rubric, to_review, received,
    received_note: doneMine || settings.status === "closed" ? null : "Feedback on your work appears once you've finished your own reviews." });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensurePeer(env);
  const now = Date.now();

  if (b.action === "submit") {
    const r = await env.DB.prepare("SELECT * FROM peer_reviews WHERE id=?").bind(String(b.reviewId || "")).first();
    if (!r) return json({ error: "not found" }, 404);
    const { user, error } = await courseAccess(env, request, r.course_id, "member");
    if (error) return error;
    if (r.reviewer_id !== user.id) return json({ error: "forbidden" }, 403);
    const st = await env.DB.prepare("SELECT status FROM peer_review_settings WHERE assignment_id=?").bind(r.assignment_id).first();
    if (!st || st.status !== "open") return json({ error: "Peer review is closed for this assignment." }, 400);
    const comment = cleanText(b.comment, 3000);
    if (comment.length < MIN_COMMENT) return json({ error: `Write at least ${MIN_COMMENT} characters of feedback.` }, 400);
    const ms = await getSettings(env, r.course_id);
    if (ms.filter_enabled) { const f = filterText(comment); if (f) return json({ error: f }, 400); }
    let scores = null;
    const rubric = await rubricForAssignment(env, r.assignment_id);
    if (rubric) {
      const sc = scoreRubric(rubric.criteria, b.rubricScores);
      if (typeof sc === "string") return json({ error: sc }, 400);
      scores = sc.scores;
    }
    await env.DB.prepare("UPDATE peer_reviews SET status='done', comment=?, rubric_scores=?, submitted_at=? WHERE id=?").bind(comment, scores ? JSON.stringify(scores) : null, now, r.id).run();
    await logEvent(env, user, "peer_review_submitted", r.assignment_id, null, { targetType: "assignment" });
    return json({ ok: true });
  }

  if (b.action === "hide") {
    const r = await env.DB.prepare("SELECT * FROM peer_reviews WHERE id=?").bind(String(b.reviewId || "")).first();
    if (!r) return json({ error: "not found" }, 404);
    const { user, error } = await courseAccess(env, request, r.course_id, "teacher");
    if (error) return error;
    await env.DB.prepare("UPDATE peer_reviews SET hidden=1 WHERE id=?").bind(r.id).run();
    await logEvent(env, user, "peer_review_hidden", r.assignment_id, null, { subject: r.reviewer_id, targetType: "assignment" });
    return json({ ok: true });
  }

  const a = await assignmentOf(env, b.assignmentId);
  if (!a) return json({ error: "assignment not found" }, 404);
  const { user, error } = await courseAccess(env, request, a.course_id, "teacher");
  if (error) return error;
  if (b.action === "close") {
    await env.DB.prepare("UPDATE peer_review_settings SET status='closed', updated_by=? WHERE assignment_id=?").bind(user.id, a.id).run();
    await logEvent(env, user, "peer_review_closed", a.id, null, { targetType: "assignment" });
    return json({ ok: true });
  }
  if (b.action === "start") {
    if (await env.DB.prepare("SELECT 1 AS x FROM peer_review_settings WHERE assignment_id=?").bind(a.id).first()) return json({ error: "Peer review has already been started for this assignment." }, 409);
    const per = Math.max(1, Math.min(5, Math.round(Number(b.perLearner) || 2)));
    const subs = (await env.DB.prepare("SELECT id, user_id FROM submissions WHERE assignment_id=?").bind(a.id).all()).results || [];
    if (subs.length < 2) return json({ error: "At least two learners need to have submitted." }, 400);
    if (per > subs.length - 1) return json({ error: `With ${subs.length} submissions, each learner can review at most ${subs.length - 1}.` }, 400);
    const pairs = allocate(subs, per);
    await env.DB.prepare("INSERT INTO peer_review_settings (assignment_id, course_id, reviews_per_learner, anonymous, status, opened_at, updated_by) VALUES (?,?,?,?,'open',?,?)")
      .bind(a.id, a.course_id, per, b.anonymous === false ? 0 : 1, now, user.id).run();
    for (const p of pairs) {
      await env.DB.prepare("INSERT OR IGNORE INTO peer_reviews (id, assignment_id, course_id, reviewer_id, submission_id, created_at) VALUES (?,?,?,?,?,?)")
        .bind(newId(), a.id, a.course_id, p.reviewer_id, p.submission_id, now).run();
    }
    await logEvent(env, user, "peer_review_started", a.id, `${subs.length} learners x ${per}`, { targetType: "assignment" });
    await notify(env, [...new Set(subs.map((s) => s.user_id))], { kind: "peer_review", courseId: a.course_id, title: `Peer review: ${a.title}`, body: `Please give feedback on ${per} classmate${per === 1 ? "'s" : "s'"} work.`, url: `/course-tools?course=${a.course_id}#peer`, dedupe: `peer:${a.id}` });
    return json({ ok: true, learners: subs.length, perLearner: per });
  }
  return json({ error: "unknown action" }, 400);
}
