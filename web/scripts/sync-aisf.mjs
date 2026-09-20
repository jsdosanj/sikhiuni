// Import the Full-MLI phases of "AI Engineering from Scratch" (MIT, © Rohit
// Ghumare) into the Institute. A MAINTAINER dev tool — not part of `npm run
// build`. Run it, review the diff, commit the generated JSON; CI then validates
// the committed data (validate-institute.mjs).
//
//   AISF_REPO=/path/to/ai-engineering-from-scratch  node scripts/sync-aisf.mjs
//   (no env -> clones a shallow copy to /tmp/aisf-sync)
//
// Output: web/src/data/institute/imported/<track>/index.json  (lesson list)
//         web/src/data/institute/imported/<track>/<slug>.json (per lesson)
// Our own additions (seva intros, extra lab checks) live in ours/<track>/ and
// are merged at build time (sync-institute.mjs) — this script NEVER touches them.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { parseLessonDoc, bodyToHtml } from './lib/aisf-md.mjs';

// Lesson figures (the ![alt](../assets/x.svg) diagrams) are copied here and
// served as /technology-figures/x.svg. Wiped and rebuilt each run.
const FIG_OUT = 'public/technology-figures';

// phase dir -> Institute track id (must match manifest.json). All 20 AISF
// phases: the 7 MLI phases shipped first (Wave 4), the other 13 as a depth
// wave. Order here is the AISF spine order.
const PHASES = [
  ['00-setup-and-tooling', 'aisf-00-setup'],
  ['01-math-foundations', 'aisf-01-math'],
  ['02-ml-fundamentals', 'aisf-02-ml'],
  ['03-deep-learning-core', 'aisf-03-deep-learning'],
  ['04-computer-vision', 'aisf-04-vision'],
  ['05-nlp-foundations-to-advanced', 'aisf-05-nlp'],
  ['06-speech-and-audio', 'aisf-06-speech'],
  ['07-transformers-deep-dive', 'aisf-07-transformers'],
  ['08-generative-ai', 'aisf-08-genai'],
  ['09-reinforcement-learning', 'aisf-09-rl'],
  ['10-llms-from-scratch', 'aisf-10-llms-from-scratch'],
  ['11-llm-engineering', 'aisf-11-llm-engineering'],
  ['12-multimodal-ai', 'aisf-12-multimodal'],
  ['13-tools-and-protocols', 'aisf-13-tools-protocols'],
  ['14-agent-engineering', 'aisf-14-agent-engineering'],
  ['15-autonomous-systems', 'aisf-15-autonomous'],
  ['16-multi-agent-and-swarms', 'aisf-16-multi-agent'],
  ['17-infrastructure-and-production', 'aisf-17-infra'],
  ['18-ethics-safety-alignment', 'aisf-18-ethics'],
  ['19-capstone-projects', 'aisf-19-capstone'],
];
const LANGS = { python: 'py', typescript: 'ts', javascript: 'js', rust: 'rs', julia: 'jl', node: 'js' };

let REPO = process.env.AISF_REPO;
if (!REPO) {
  REPO = '/tmp/aisf-sync';
  if (existsSync(REPO)) rmSync(REPO, { recursive: true, force: true });
  console.log('cloning ai-engineering-from-scratch (shallow) …');
  execSync(`git clone --depth 1 -q https://github.com/rohitg00/ai-engineering-from-scratch.git ${REPO}`);
}
const COMMIT = execSync(`git -C ${REPO} rev-parse --short HEAD`).toString().trim();
const OUT = 'src/data/institute/imported';

if (existsSync(FIG_OUT)) rmSync(FIG_OUT, { recursive: true, force: true });
mkdirSync(FIG_OUT, { recursive: true });

let totalLessons = 0;
let totalQuiz = 0;
let totalFigs = 0;

for (const [phaseDir, trackId] of PHASES) {
  const pDir = join(REPO, 'phases', phaseDir);
  if (!existsSync(pDir)) { console.warn(`skip ${phaseDir} — not in source`); continue; }

  // phase blurb from the README's "> …" line
  let blurb = '';
  try {
    const rm = readFileSync(join(pDir, 'README.md'), 'utf-8');
    const m = rm.match(/^>\s+(.+)$/m);
    if (m) blurb = m[1].trim();
  } catch { /* no readme */ }

  const lessonDirs = readdirSync(pDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name))
    .map((d) => d.name)
    .sort();

  const outDir = join(OUT, trackId);
  mkdirSync(outDir, { recursive: true });
  const index = [];

  for (const ld of lessonDirs) {
    const num = parseInt(ld.slice(0, 2), 10);
    const slug = ld.slice(3);
    const enPath = join(pDir, ld, 'docs', 'en.md');
    if (!existsSync(enPath)) { console.warn(`  ${trackId}/${ld} — no docs/en.md`); continue; }

    const { title, tagline, meta, objectives, bodyMd } = parseLessonDoc(readFileSync(enPath, 'utf-8'));
    const { html, hasMermaid, assets } = bodyToHtml(bodyMd);

    // Copy each referenced figure SVG into public/technology-figures/. The
    // markdown path is ../assets/<name> relative to docs/, i.e. <ld>/assets/.
    for (const name of assets) {
      const srcSvg = join(pDir, ld, 'assets', name);
      if (existsSync(srcSvg)) { cpSync(srcSvg, join(FIG_OUT, name)); totalFigs += 1; }
      else console.warn(`  ${trackId}/${slug} — figure asset missing: ${name}`);
    }

    // "type this" code: the code/ dir, keyed by language.
    const code = {};
    const codeDir = join(pDir, ld, 'code');
    if (existsSync(codeDir)) {
      for (const f of readdirSync(codeDir)) {
        const ext = f.split('.').pop();
        const langKey = Object.entries(LANGS).find(([, e]) => e === ext)?.[0];
        if (langKey && /^(main|solution|example)\./.test(f)) {
          code[LANGS[langKey]] = readFileSync(join(codeDir, f), 'utf-8');
        }
      }
    }

    // quiz.json -> our { q, options, answer, explanation }
    let quiz = [];
    const qPath = join(pDir, ld, 'quiz.json');
    if (existsSync(qPath)) {
      try {
        const raw = JSON.parse(readFileSync(qPath, 'utf-8'));
        const qs = Array.isArray(raw) ? raw : (raw.questions || []);
        quiz = qs
          .filter((q) => Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correct))
          .map((q) => ({ q: q.question, options: q.options, answer: q.correct, explanation: q.explanation || '' }));
      } catch (e) { console.warn(`  ${trackId}/${ld} — bad quiz.json: ${e.message}`); }
    }

    const lessonId = `${trackId}::${slug}`;
    writeFileSync(join(outDir, `${slug}.json`), JSON.stringify({
      id: lessonId,
      num,
      slug,
      title: title || slug,
      tagline,
      type: meta.type || '',
      languages: meta.languages || '',
      time: meta.time || '',
      objectives,
      prose_html: html,
      hasMermaid,
      code,
      quiz,
      source: { repo: 'rohitg00/ai-engineering-from-scratch', commit: COMMIT, path: `phases/${phaseDir}/${ld}` },
    }, null, 2) + '\n');

    index.push({ id: lessonId, num, slug, title: title || slug, nQuiz: quiz.length });
    totalLessons += 1;
    totalQuiz += quiz.length;
  }

  writeFileSync(join(outDir, 'index.json'), JSON.stringify({
    track: trackId,
    phaseDir,
    blurb,
    license: 'MIT',
    source: { repo: 'rohitg00/ai-engineering-from-scratch', commit: COMMIT },
    generated: new Date().toISOString().slice(0, 10),
    lessons: index,
  }, null, 2) + '\n');

  console.log(`${trackId.padEnd(26)} ${index.length} lessons, ${index.reduce((n, l) => n + l.nQuiz, 0)} quiz Qs`);
}

console.log(`\nsync-aisf: ${totalLessons} lessons, ${totalQuiz} quiz questions, ${totalFigs} figure SVGs across ${PHASES.length} phases (source ${COMMIT})`);
