import { json, newId, logEvent } from "./_lib.js";
import { schemaOnce } from "./_schema-once.js";
import { courseAccess, cleanText } from "./_course-auth.js";
import { notify, courseLearnerIds } from "./_notify.js";

// C12 Polls, surveys and course evaluations (Moodle Choice/Feedback, Canvas surveys).
//
// kind: "poll"        quick question(s); learners see the tallies after answering
//       "survey"      teacher-only results
//       "evaluation"  end-of-course evaluation; anonymous by default, starts from a template
// Anonymity is structural, not a display flag: for an anonymous poll the response row has
// NO user id. A separate poll_participants row (no timestamp, no answers) stops a second
// response. Response times are kept to the day. Results of an anonymous poll stay hidden
// until MIN_ANON responses exist, so one reply can't be traced to the one learner who sent it.
//
// GET  /api/polls?courseId=                list (teacher: all, with counts; learner: open/closed + answered flag)
// GET  /api/polls?id=                      one poll + questions (+ results when allowed)
// POST /api/polls { action:"create", courseId, kind, title, anonymous?, closesAt?, questions? }
// POST /api/polls { action:"update", id, title?, status?, closesAt?, questions? }   (questions only before any response)
// POST /api/polls { action:"delete", id }
// POST /api/polls { action:"respond", id, answers:[...] }                          (enrolled learner, open poll)

export const MIN_ANON = 3;
const KINDS = ["poll", "survey", "evaluation"];
const TYPES = ["choice", "scale", "text"];
const DAY = 24 * 60 * 60 * 1000;

export const EVALUATION_TEMPLATE = [
  { type: "scale", prompt: "The course materials were clear." },
  { type: "scale", prompt: "The teacher answered questions and gave useful feedback." },
  { type: "scale", prompt: "The pace of the course was right for me." },
  { type: "scale", prompt: "I would recommend this course to others." },
  { type: "text", prompt: "What worked well?" },
  { type: "text", prompt: "What should be improved?" },
];

async function ensure(env) {
  return schemaOnce(env.DB, "polls", async () => {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS polls (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, " +
      "anonymous INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', closes_at INTEGER, questions TEXT NOT NULL, " +
      "created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_polls_course ON polls(course_id, status)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS poll_participants (poll_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (poll_id, user_id))").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS poll_responses (id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, user_id TEXT, answers TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_poll_responses_poll ON poll_responses(poll_id)").run();
  });
}
export { ensure as ensurePolls };

/** Validate teacher-supplied questions. Returns an array or a string error. */
export function cleanQuestions(qs) {
  if (!Array.isArray(qs) || !qs.length) return "Add at least one question.";
  if (qs.length > 30) return "At most 30 questions.";
  const out = [];
  for (const q of qs) {
    const type = TYPES.includes(q && q.type) ? q.type : null;
    const prompt = cleanText(q && q.prompt, 500);
    if (!type || !prompt) return "Each question needs a type and a prompt.";
    const item = { type, prompt };
    if (type === "choice") {
      const opts = (Array.isArray(q.options) ? q.options : []).map((o) => cleanText(o, 200)).filter(Boolean).slice(0, 10);
      if (opts.length < 2) return "A choice question needs at least two options.";
      item.options = opts;
    }
    out.push(item);
  }
  return out;
}

/** Validate a learner's answers against the questions. Returns an array or a string error. */
export function cleanAnswers(questions, answers) {
  if (!Array.isArray(answers) || answers.length !== questions.length) return "Answer every question.";
  const out = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i], a = answers[i];
    if (q.type === "text") { out.push(cleanText(a, 2000) || null); continue; } // text may be left blank
    const n = a == null || a === "" ? NaN : Number(a);
    const [lo, hi] = q.type === "choice" ? [0, q.options.length - 1] : [1, 5];
    if (!Number.isInteger(n) || n < lo || n > hi) return "Answer every question.";
    out.push(n);
  }
  return out;
}

/** Aggregate responses per question: choice -> counts, scale -> counts 1..5 + mean, text -> list. */
export function tally(questions, rows) {
  return questions.map((q, i) => {
    const vals = rows.map((r) => r[i]);
    if (q.type === "text") return { type: q.type, answers: vals.filter((v) => v) };
    const size = q.type === "choice" ? q.options.length : 5;
    const counts = Array(size).fill(0);
    for (const v of vals) if (Number.isInteger(v)) counts[q.type === "choice" ? v : v - 1]++;
    const out = { type: q.type, counts };
    if (q.type === "scale") { const n = counts.reduce((a, b) => a + b, 0); out.mean = n ? Math.round((counts.reduce((s, c, k) => s + c * (k + 1), 0) / n) * 10) / 10 : null; }
    return out;
  });
}

const isOpen = (p, now) => p.status === "open" && !(p.closes_at && now > p.closes_at);

async function loadResponses(env, pollId) {
  const { results } = await env.DB.prepare("SELECT user_id, answers FROM poll_responses WHERE poll_id=? ORDER BY created_at").bind(pollId).all();
  return (results || []).map((r) => ({ user_id: r.user_id, answers: JSON.parse(r.answers) }));
}

export async function onRequestGet({ request, env }) {
  const sp = new URL(request.url).searchParams;
  await ensure(env);
  const now = Date.now();
  const id = sp.get("id");
  if (id) {
    const p = await env.DB.prepare("SELECT * FROM polls WHERE id=?").bind(id).first();
    if (!p) return json({ error: "not found" }, 404);
    const { user, teach, error } = await courseAccess(env, request, p.course_id, "member");
    if (error) return error;
    if (!teach && p.status === "draft") return json({ error: "not found" }, 404);
    const questions = JSON.parse(p.questions);
    const answered = teach ? false : !!(await env.DB.prepare("SELECT 1 AS x FROM poll_participants WHERE poll_id=? AND user_id=?").bind(id, user.id).first());
    const poll = { id: p.id, course_id: p.course_id, kind: p.kind, title: p.title, anonymous: !!p.anonymous, status: p.status, closes_at: p.closes_at, open: isOpen(p, now), questions, answered };
    const showResults = teach || (p.kind === "poll" && answered);
    if (showResults) {
      const rows = await loadResponses(env, id);
      poll.responses = rows.length;
      if (p.anonymous && rows.length < MIN_ANON) poll.results_hidden = `Results appear after ${MIN_ANON} responses, to protect anonymity.`;
      else {
        poll.results = tally(questions, rows.map((r) => r.answers));
        // Learners get choice/scale tallies only; text answers are for the teacher.
        if (!teach) poll.results = poll.results.map((r) => (r.type === "text" ? { type: "text", answers: [] } : r));
        if (teach && !p.anonymous) {
          const ids = rows.map((r) => r.user_id).filter(Boolean);
          const names = ids.length ? (await env.DB.prepare(`SELECT id, name, email FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [] : [];
          const byId = Object.fromEntries(names.map((u) => [u.id, u.name || u.email]));
          poll.individual = rows.map((r) => ({ name: byId[r.user_id] || "Learner", answers: r.answers }));
        }
      }
    }
    return json({ poll });
  }
  const courseId = sp.get("courseId");
  const { user, teach, error } = await courseAccess(env, request, courseId, "member");
  if (error) return error;
  if (teach) {
    const { results } = await env.DB.prepare(
      "SELECT p.id, p.kind, p.title, p.anonymous, p.status, p.closes_at, p.created_at, (SELECT COUNT(*) FROM poll_participants x WHERE x.poll_id=p.id) AS responses " +
      "FROM polls p WHERE p.course_id=? ORDER BY p.created_at DESC").bind(courseId).all();
    return json({ scope: "teacher", polls: results || [] });
  }
  const { results } = await env.DB.prepare(
    "SELECT p.id, p.kind, p.title, p.anonymous, p.status, p.closes_at, " +
    "EXISTS(SELECT 1 FROM poll_participants x WHERE x.poll_id=p.id AND x.user_id=?) AS answered " +
    "FROM polls p WHERE p.course_id=? AND p.status != 'draft' ORDER BY p.created_at DESC").bind(user.id, courseId).all();
  return json({ scope: "learner", polls: (results || []).map((p) => ({ ...p, open: isOpen(p, now), answered: !!p.answered })) });
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ error: "bad request" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "bad request" }, 400);
  await ensure(env);
  const now = Date.now();

  if (b.action === "create") {
    const { user, error } = await courseAccess(env, request, b.courseId, "teacher");
    if (error) return error;
    const kind = KINDS.includes(b.kind) ? b.kind : "poll";
    const title = cleanText(b.title, 200);
    if (!title) return json({ error: "Give it a title." }, 400);
    const questions = cleanQuestions(b.questions == null && kind === "evaluation" ? EVALUATION_TEMPLATE : b.questions);
    if (typeof questions === "string") return json({ error: questions }, 400);
    const anonymous = b.anonymous == null ? kind === "evaluation" : !!b.anonymous;
    const closesAt = Number.isFinite(Number(b.closesAt)) && b.closesAt ? Number(b.closesAt) : null;
    const id = newId();
    await env.DB.prepare("INSERT INTO polls (id, course_id, kind, title, anonymous, status, closes_at, questions, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, b.courseId, kind, title, anonymous ? 1 : 0, "draft", closesAt, JSON.stringify(questions), user.id, now, now).run();
    await logEvent(env, user, "poll_created", id, `${kind}: ${title}`, { targetType: "poll" });
    return json({ ok: true, id });
  }

  const p = b.id ? await env.DB.prepare("SELECT * FROM polls WHERE id=?").bind(String(b.id)).first() : null;
  if (!p) return json({ error: "not found" }, 404);

  if (b.action === "respond") {
    const { user, teach, error } = await courseAccess(env, request, p.course_id, "member");
    if (error) return error;
    if (teach) return json({ error: "Only learners respond." }, 400);
    if (!isOpen(p, now)) return json({ error: "This poll is not open." }, 400);
    const answers = cleanAnswers(JSON.parse(p.questions), b.answers);
    if (typeof answers === "string") return json({ error: answers }, 400);
    // The participant row is the double-vote guard; INSERT OR IGNORE + changes tells us who won a race.
    const r = await env.DB.prepare("INSERT OR IGNORE INTO poll_participants (poll_id, user_id) VALUES (?,?)").bind(p.id, user.id).run();
    if (!(r && r.meta && r.meta.changes)) return json({ error: "You have already responded." }, 409);
    await env.DB.prepare("INSERT INTO poll_responses (id, poll_id, user_id, answers, created_at) VALUES (?,?,?,?,?)")
      .bind(newId(), p.id, p.anonymous ? null : user.id, JSON.stringify(answers), p.anonymous ? Math.floor(now / DAY) * DAY : now).run();
    return json({ ok: true });
  }

  const { user, error } = await courseAccess(env, request, p.course_id, "teacher");
  if (error) return error;
  if (b.action === "delete") {
    await env.DB.prepare("DELETE FROM poll_responses WHERE poll_id=?").bind(p.id).run();
    await env.DB.prepare("DELETE FROM poll_participants WHERE poll_id=?").bind(p.id).run();
    await env.DB.prepare("DELETE FROM polls WHERE id=?").bind(p.id).run();
    await logEvent(env, user, "poll_deleted", p.id, p.title, { targetType: "poll" });
    return json({ ok: true });
  }
  if (b.action === "update") {
    let questions = null;
    if (b.questions != null) {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM poll_participants WHERE poll_id=?").bind(p.id).first();
      if (n && n.n) return json({ error: "Questions can't change after people have responded." }, 409);
      questions = cleanQuestions(b.questions);
      if (typeof questions === "string") return json({ error: questions }, 400);
    }
    const status = ["draft", "open", "closed"].includes(b.status) ? b.status : null;
    const title = b.title != null ? cleanText(b.title, 200) || null : null;
    const closesAt = b.closesAt === null ? null : Number.isFinite(Number(b.closesAt)) && b.closesAt ? Number(b.closesAt) : p.closes_at;
    await env.DB.prepare("UPDATE polls SET title=COALESCE(?,title), status=COALESCE(?,status), closes_at=?, questions=COALESCE(?,questions), updated_at=? WHERE id=?")
      .bind(title, status, closesAt, questions ? JSON.stringify(questions) : null, now, p.id).run();
    await logEvent(env, user, "poll_updated", p.id, status ? `status=${status}` : null, { targetType: "poll", before: { status: p.status }, after: { status: status || p.status } });
    if (status === "open" && p.status !== "open") {
      await notify(env, await courseLearnerIds(env, p.course_id), { kind: "poll", courseId: p.course_id, title: `${p.kind === "evaluation" ? "Course evaluation" : p.kind === "survey" ? "New survey" : "New poll"}: ${title || p.title}`, url: `/course-tools?course=${p.course_id}#polls`, dedupe: `poll:${p.id}` });
    }
    return json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
}
