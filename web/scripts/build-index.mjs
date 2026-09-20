// Emit slim client data artifacts from the 45 MB catalogue so pages don't fetch
// the monolith. Node-only (no python in the build path). Runs in `npm run build`.
//   /data/index.json      — topics + per-course metadata (all courses, no lessons/quiz).
//                            Used by dashboard, verify, cert, admin.
//   /data/search.json     — published courses with search fields (terms/outcomes/lesson
//                            titles) + topics + paths. Used by search and the flashcard deck.
//   /data/exam/<id>.json  — one program's cumulative-exam question pool (no answers —
//                            same discipline as the two above; grading is server-side via
//                            /api/program-exam, keyed by courseId+question-index). Used by
//                            program/[id].astro instead of fetching the full catalogue.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const src = JSON.parse(readFileSync('../site/assets/data/courses.json', 'utf-8'));
const all = src.courses || [];
mkdirSync('public/data', { recursive: true });
mkdirSync('public/data/exam', { recursive: true });

// index.json: metadata only, all courses
const index = {
  topics: src.topics || [],
  courses: all.map((c) => ({
    id: c.id, title: c.title, topic: c.topic, level: c.level,
    professor: c.professor, status: c.status, summary: c.summary,
    nLessons: (c.lessons || []).length, nQuiz: (c.quiz || []).length,
    ...(c.gated ? { gated: true } : {}),
  })),
};
const indexOut = JSON.stringify(index);
writeFileSync('public/data/index.json', indexOut);

// search.json: published courses with search fields
const search = {
  topics: src.topics || [],
  paths: src.paths || [],
  courses: all.filter((c) => c.status === 'published').map((c) => ({
    id: c.id, title: c.title, professor: c.professor, topic: c.topic,
    summary: c.summary, terms: c.terms || [], outcomes: c.outcomes || [],
    lessonTitles: (c.lessons || []).map((l) => l.title),
  })),
};
const searchOut = JSON.stringify(search);
writeFileSync('public/data/search.json', searchOut);

// exam/<id>.json: one program's quiz question pool, no answers
const courseById = Object.fromEntries(all.map((c) => [c.id, c]));
const { programs } = JSON.parse(readFileSync('public/assets/data/programs.json', 'utf-8'));
let examBytes = 0;
for (const prog of programs) {
  const questions = [];
  for (const cid of prog.courseIds || []) {
    const c = courseById[cid];
    if (!c) continue;
    (c.quiz || []).forEach((q, qi) => {
      questions.push({ cid: c.id, qi, q: q.q, options: q.options, courseTitle: c.title });
    });
  }
  const out = JSON.stringify({ questions });
  examBytes += out.length;
  writeFileSync(`public/data/exam/${prog.id}.json`, out);
}

console.log(`build-index: index.json ${(indexOut.length / 1024) | 0} KB (${index.courses.length} courses), ` +
  `search.json ${(searchOut.length / 1024) | 0} KB (${search.courses.length} published), ` +
  `exam/*.json ${(examBytes / 1024) | 0} KB total (${programs.length} programs)`);
