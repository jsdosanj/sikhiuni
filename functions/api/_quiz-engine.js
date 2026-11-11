// C2 richer quizzes: question types, the learner-safe view, and server-side grading.
// Teacher-made course quizzes only; the existing course quiz / exam grading
// (quiz.js, program-exam.js, institute-exam.js) and their pass marks are untouched.
//
// Types and stored data (never sent to learners before review):
//   single    { options:[str], correct:int, feedback?:[str] }
//   multi     { options:[str], correct:[int], feedback?:[str] }     partial credit, wrong picks subtract
//   truefalse { correct:bool, feedback?:{ true:str, false:str } }
//   short     { accept:[str] }                                      trimmed, case/space-insensitive, Unicode NFC
//   numeric   { answer:num, tolerance:num }
//   matching  { left:[str], right:[str] }                           left[i] matches right[i]; per-pair credit
//   ordering  { items:[str] }                                       the stored order is correct; per-position credit
// Choices, matching targets and ordering items are shuffled per attempt, and learners
// answer with positions in THEIR shuffled list, so the stored order never leaks.

export const QUESTION_TYPES = ["single", "multi", "truefalse", "short", "numeric", "matching", "ordering"];

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const strList = (a, max, n) => (Array.isArray(a) ? a : []).map((x) => clean(x, max)).filter(Boolean).slice(0, n);

/** Validate one teacher-supplied question. Returns the cleaned question or an error string. */
export function cleanQuestion(q, i = 0) {
  const where = `Question ${i + 1}`;
  if (!q || !QUESTION_TYPES.includes(q.type)) return `${where}: choose a question type.`;
  const prompt = clean(q.prompt, 2000);
  if (!prompt) return `${where}: write the question.`;
  const points = Math.max(1, Math.min(100, Math.round(Number(q.points) || 1)));
  const out = { id: /^[a-z0-9]{6,32}$/.test(q.id || "") ? q.id : null, type: q.type, prompt, points, data: {} };
  const d = q.data || {};
  const fb = (n) => { const f = strList(d.feedback, 500, n); return f.length ? f : undefined; };
  if (q.type === "single" || q.type === "multi") {
    const options = strList(d.options, 300, 12);
    if (options.length < 2) return `${where}: add at least two options.`;
    if (q.type === "single") {
      const c = Number(d.correct);
      if (!Number.isInteger(c) || c < 0 || c >= options.length) return `${where}: mark the correct option.`;
      out.data = { options, correct: c, feedback: fb(options.length) };
    } else {
      const c = [...new Set((Array.isArray(d.correct) ? d.correct : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length))].sort();
      if (!c.length) return `${where}: mark at least one correct option.`;
      out.data = { options, correct: c, feedback: fb(options.length) };
    }
  } else if (q.type === "truefalse") {
    if (typeof d.correct !== "boolean") return `${where}: choose true or false as the answer.`;
    out.data = { correct: d.correct };
  } else if (q.type === "short") {
    const accept = strList(d.accept, 200, 20);
    if (!accept.length) return `${where}: list at least one accepted answer.`;
    out.data = { accept };
  } else if (q.type === "numeric") {
    const answer = Number(d.answer), tolerance = Math.abs(Number(d.tolerance) || 0);
    if (!Number.isFinite(answer)) return `${where}: give the numeric answer.`;
    out.data = { answer, tolerance };
  } else if (q.type === "matching") {
    const left = strList(d.left, 200, 12), right = strList(d.right, 200, 12);
    if (left.length < 2 || left.length !== right.length) return `${where}: give at least two pairs, each with both sides.`;
    out.data = { left, right };
  } else if (q.type === "ordering") {
    const items = strList(d.items, 200, 12);
    if (items.length < 2) return `${where}: give at least two items to order.`;
    out.data = { items };
  }
  if (out.data.feedback === undefined) delete out.data.feedback;
  return out;
}

/** Fisher–Yates with a supplied random source (crypto in production, seeded in tests). */
export function shuffled(n, rand = Math.random) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const cryptoRand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** Per-attempt permutation for a question (positions shown -> stored indexes). */
export function permFor(q, rand = cryptoRand) {
  const n = q.type === "single" || q.type === "multi" ? q.data.options.length
    : q.type === "matching" ? q.data.right.length : q.type === "ordering" ? q.data.items.length : 0;
  return n ? shuffled(n, rand) : null;
}

/** What a learner sees: no answers, choices in this attempt's order. */
export function learnerView(q, perm) {
  const base = { id: q.id, type: q.type, prompt: q.prompt, points: q.points };
  if (q.type === "single" || q.type === "multi") return { ...base, options: perm.map((i) => q.data.options[i]) };
  if (q.type === "matching") return { ...base, left: q.data.left, right: perm.map((i) => q.data.right[i]) };
  if (q.type === "ordering") return { ...base, items: perm.map((i) => q.data.items[i]) };
  return base;
}

const norm = (s) => String(s || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** Grade one answer. Returns { earned, max, correct } (earned may be fractional). */
export function gradeQuestion(q, perm, ans) {
  const max = q.points;
  const full = (ok) => ({ earned: ok ? max : 0, max, correct: !!ok });
  if (ans == null) return { earned: 0, max, correct: false };
  switch (q.type) {
    case "single": { const n = Number(ans); return full(Number.isInteger(n) && perm[n] === q.data.correct); }
    case "multi": {
      const picked = new Set((Array.isArray(ans) ? ans : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < perm.length).map((n) => perm[n]));
      const right = new Set(q.data.correct);
      let hits = 0, wrong = 0;
      for (const p of picked) (right.has(p) ? hits++ : wrong++);
      const frac = Math.max(0, (hits - wrong) / right.size);
      return { earned: max * frac, max, correct: frac === 1 };
    }
    case "truefalse": return full(ans === q.data.correct || ans === String(q.data.correct));
    case "short": return full(q.data.accept.some((a) => norm(a) === norm(ans)));
    case "numeric": { const n = Number(ans); return full(String(ans).trim() !== "" && Number.isFinite(n) && Math.abs(n - q.data.answer) <= q.data.tolerance + 1e-9); }
    case "matching": {
      // ans[i] = shown position of the right-hand item matched to left[i]
      const a = Array.isArray(ans) ? ans : [];
      const n = q.data.left.length;
      let ok = 0;
      for (let i = 0; i < n; i++) { const pos = Number(a[i]); if (Number.isInteger(pos) && perm[pos] === i) ok++; }
      return { earned: (max * ok) / n, max, correct: ok === n };
    }
    case "ordering": {
      // ans = shown positions, in the learner's chosen order
      const a = Array.isArray(ans) ? ans.map(Number) : [];
      const n = q.data.items.length;
      if (new Set(a).size !== a.length) return { earned: 0, max, correct: false }; // a repeated item can't score
      let ok = 0;
      for (let i = 0; i < n; i++) if (Number.isInteger(a[i]) && perm[a[i]] === i) ok++;
      return { earned: (max * ok) / n, max, correct: ok === n };
    }
  }
  return { earned: 0, max, correct: false };
}

/** The correct answer and any feedback, in the learner's shown order (for review only). */
export function reviewOf(q, perm, ans) {
  const out = {};
  if (q.type === "single") { out.correct = perm.indexOf(q.data.correct); if (q.data.feedback && Number.isInteger(Number(ans))) out.feedback = q.data.feedback[perm[Number(ans)]] || null; }
  else if (q.type === "multi") out.correct = q.data.correct.map((c) => perm.indexOf(c)).sort((x, y) => x - y);
  else if (q.type === "truefalse") out.correct = q.data.correct;
  else if (q.type === "short") out.correct = q.data.accept[0];
  else if (q.type === "numeric") out.correct = q.data.answer;
  else if (q.type === "matching") out.correct = q.data.left.map((_, i) => perm.indexOf(i));
  else if (q.type === "ordering") out.correct = q.data.items.map((_, i) => perm.indexOf(i));
  return out;
}
