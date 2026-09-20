// Assemble the Institute's runtime data into public/ (dev + static assets).
// Node-only; runs first in `npm run build`.
//
//   src/data/institute/manifest.json    -> public/data/institute/manifest.json
//   src/data/institute/professors.json  -> public/data/institute/professors.json
//   src/data/institute/exam/<t>.json    -> public/data/institute/exam/<t>.json  (answer-free)
//   src/data/institute/dojo/**          -> public/data/institute/dojo/**        (Wave 3)
//   src/data/institute/imported/<t>/<l>.json  merged with ours/<t>/<l>.json,
//       quiz[].answer + quiz[].explanation STRIPPED, ->
//       public/data/institute/lessons/<t>/<l>.json
//
// The server-only answer keys are built separately by
// build-institute-quiz-keys.mjs (never shipped to the browser).
import {
  cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';

const SRC = 'src/data/institute';
const OUT = 'public/data/institute';

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'lessons'), { recursive: true });

cpSync(`${SRC}/manifest.json`, `${OUT}/manifest.json`);
cpSync(`${SRC}/professors.json`, `${OUT}/professors.json`);
if (existsSync(`${SRC}/exam`)) cpSync(`${SRC}/exam`, `${OUT}/exam`, { recursive: true });
if (existsSync(`${SRC}/dojo`)) cpSync(`${SRC}/dojo`, `${OUT}/dojo`, { recursive: true });
// Open Source Atlas: chunked repo directory + search index + video shelf,
// snapshot committed under src/, refreshed by `node scripts/build-atlas.mjs`.
if (existsSync(`${SRC}/atlas`)) cpSync(`${SRC}/atlas`, `${OUT}/atlas`, { recursive: true });

let lessonCount = 0;
const imp = `${SRC}/imported`;
if (existsSync(imp)) {
  for (const track of readdirSync(imp, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const tSrc = join(imp, track);
    const oSrc = join(SRC, 'ours', track);
    const tOut = join(OUT, 'lessons', track);
    mkdirSync(tOut, { recursive: true });

    cpSync(join(tSrc, 'index.json'), join(tOut, 'index.json'));

    for (const f of readdirSync(tSrc).filter((n) => n.endsWith('.json') && n !== 'index.json')) {
      const lesson = JSON.parse(readFileSync(join(tSrc, f), 'utf-8'));

      // Merge our own additions (seva intro is at the track level; per-lesson
      // overrides — extra lab checks, an editorial note — live in ours/<t>/<slug>.json).
      const ourPath = join(oSrc, f);
      if (existsSync(ourPath)) {
        const ours = JSON.parse(readFileSync(ourPath, 'utf-8'));
        if (ours.checks) lesson.checks = ours.checks;
        if (ours.note_html) lesson.note_html = ours.note_html;
        if (ours.lab) lesson.lab = ours.lab;
      }

      // Never ship the answer key or the answer-revealing explanation.
      lesson.quiz = (lesson.quiz || []).map((q) => ({ q: q.q, options: q.options }));

      writeFileSync(join(tOut, f), JSON.stringify(lesson));
      lessonCount += 1;
    }

    // Track-level seva intro (Wave 4b/C4).
    const introPath = join(oSrc, 'intro.json');
    if (existsSync(introPath)) cpSync(introPath, join(tOut, 'intro.json'));
  }
}

const m = JSON.parse(readFileSync(`${SRC}/manifest.json`, 'utf-8'));
console.log(`synced institute: ${m.tracks.length} tracks, ${lessonCount} lessons, ${existsSync(`${SRC}/exam`) ? readdirSync(`${SRC}/exam`).length : 0} exams`);
