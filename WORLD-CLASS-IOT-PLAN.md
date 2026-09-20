# Sikhi University — Institute of Technology

**World-class plan · v1 · 2026-08-28**
Status: **APPROVED 2026-08-28 — all 22 decisions resolved (C2 = Full MLI; everything else as
recommended). Wave 1 (spine) shipped. See the review report at the end.**
Design system: `DESIGN-INSTITUTE.md` (v1.0). Preview: https://claude.ai/code/artifact/b52a803e-097a-4aaf-851f-b3a64784a149

---

## 0. One paragraph

A new wing of Sikhi University — **Sikhi University · Institute of Technology (IoT)** — that
teaches software and AI engineering with the same rigor the main university brings to Gurbani.
It has its own address, its own look (a "futuristic classroom" the student walks *into*), and
its own signature interactions (a real in-browser code lab, and a terminal that teaches by
typing itself out). It plugs into the university's existing spine: real accounts, the D1
gradebook, server-graded quizzes, and verifiable certificates. Content comes from three places
we may lawfully use: **AI Engineering from Scratch** (MIT, credited to Rohit Ghumare), **our own
sikhi.io coding courses**, and **link-out "booths"** to freeCodeCamp, Class Central, and
Libre.academy for everything we should not rehost.

---

## 1. Scope — what's in, what's out

### 1.1 Built in full (native courses, interactive, our certificates)

| Wing | Source | Shape | Volume |
|---|---|---|---|
| **AI Engineering** | `rohitg00/ai-engineering-from-scratch` (MIT) | 20 phase-courses, lessons + code + quizzes | **511 lessons, 20 phases, 361 quizzes, 4 languages** (Python, TypeScript, Rust, Julia) |
| **Sikh Code — Learn Coding** | sikhi.io `data/learn/coding-fundamentals.ts` (ours) | 1 terminal-dojo course | 9 topics, auto-typing IDE |
| **Sikh Code — Learn Agentic Coding** | sikhi.io `data/learn/ai-coding.ts` (ours) | 1 command-dojo course | ~30 Claude Code commands, 6 topic groups |
| **Claude Code Guide** | sikhi.io `pages/claude-code.tsx` (ours) | 1 long-form guide + external course index | ~5 parts, 20 Anthropic course links |
| **Open Source Atlas** | sikhi.io `pages/opensource.tsx` + `/data/opensource/*` (ours) | 1 browsable directory | ~12,500 repos, chunked JSON + video shelf |

### 1.2 Redirect "booths" (link-out only, no rehosting, no certificate)

Each booth is a single page **skinned to echo that site's own brand** — the section should feel
like *walking a college fair in a high-school gym*: distinct booths, each unmistakably that
institution, all under one roof.

| Booth | Destination | Why link-only |
|---|---|---|
| **freeCodeCamp** | `freecodecamp.org/learn` | Curriculum is CC BY-SA 4.0 + BSD-3; ~11k interactive challenges; certs are theirs and must stay theirs |
| **Class Central** | `classcentral.com` (main page) | Aggregator; ToS bars scraping; their editorial content is theirs |
| **Libre.academy** | `libre.academy` | App is MIT but its ~100 course packs are each derived from a different book — several **CC BY-NC / BY-NC-ND** (Eloquent JS, You Don't Know JS Yet, Pro Git, JavaScript.info, Automate the Boring Stuff). Rehosting would violate non-commercial / no-derivatives terms we are bound to honor. |

### 1.3 Explicitly dropped

- **OSSU** (computer-science / math / data-science / bioinformatics) — not included in any form.
- **Per-course Class Central pages** — replaced by the single booth.
- **freeCodeCamp content rebuild** — replaced by the booth.

---

## 2. Non-negotiables (inherited from the university)

1. **Accuracy & honesty.** Tech content still gets a review pass; nothing claims more than it is.
   No "Created by AI" label is required for IoT courses (AISF is human-authored; sikhi.io content
   is ours) — but a course that *was* AI-expanded still says so.
2. **Content rights are the license to operate.** `docs/CONTENT-AND-LICENSING.md` rules apply:
   link/embed by default; rehost only what we own or what is openly licensed **with attribution +
   share-alike + non-commercial honored**; written permission for the rest. See §6.
3. **WCAG 2.2 AA** on every changed flow — contrast, focus, keyboard, touch targets, and every
   animation behind `prefers-reduced-motion`.
4. **CSP stays strict.** Hash-based `script-src`, no `unsafe-inline`, no external font/script hosts
   except those already allow-listed. The interactive engines are **first-party, self-contained**
   — no React/Next bundles lifted from sikhi.io, no CDN editors.
5. **Fonts self-hosted.** A monospace face is added to `web/public/fonts/` (candidate: JetBrains
   Mono or IBM Plex Mono), same pipeline as the existing faces.
6. **Deploy discipline.** Branch → PR → CI (`validate` + `node --check` + new IoT validators) →
   `gh pr merge --squash`. Large data lands in R2 via `npm run deploy-data`, never `wrangler deploy`.

---

## 3. Information architecture

### 3.1 Routes (all new, all under `/institute`)

```
/institute                         Campus entry — the "walk in" moment
/institute/catalog                 IoT course catalog (phases, dojos, guide, atlas)
/institute/track/[slug]            One phase/program overview + lesson list + syllabus
/institute/lesson/[...path]        One lesson: prose + code lab + check-understanding
/institute/dojo/[slug]             Terminal-dojo courses (learn-coding, learn-agentic-coding)
/institute/guide/[slug]            Long-form guides (claude-code)
/institute/atlas                   Open Source Atlas (the 12.5k-repo directory)
/institute/explore                 The "college fair" hall
/institute/explore/freecodecamp    Booth
/institute/explore/class-central   Booth
/institute/explore/libre-academy   Booth
/institute/licenses                IoT content-source & license register (human-readable)
```

The global **Nav** gets one new top-level entry (**Institute of Technology**, or **Technology**);
the global **Footer** is shared. Everything else — shell, palette, type, motion — is the IoT
design system (§5). A persistent, quiet "← Sikhi University" affordance returns the student to the
main campus.

### 3.2 Catalog integration

- The main `/catalog` gets a single card / row: *"Sikhi University · Institute of Technology →"*
  linking to `/institute`. IoT courses do **not** intermix into the main topic filters.
- The existing `modern-skills` topic and the `sikharchive.net/courses` cross-link are superseded
  by IoT; leave them but point them at `/institute` (surgical redirect, no data churn).

### 3.3 Data model

IoT content is **not** added to the 45 MB `courses.json`. It gets its own tree:

```
web/src/data/institute/
  manifest.json                    tracks[], courses[], counts, versions, license tags
  professors.json                  "Rohit Ghumare", "freeCodeCamp", "Sikhi University · Sikh Code"
  tracks/<track>.json              phase metadata: title, level, summary, outcomes, lesson refs, quiz plan
  lessons/<track>/<lesson>.json    { title, objectives, prose_html, figures[], code: {py,ts,rs,jl}, checks[], quizRefs[] }
  dojo/<slug>.json                 ported DojoCommand[] / FileDef[] + boot steps
  atlas/                           index.json + chunk-NNN.json (250 repos) + search.json  (ported as-is)
```

Build step (`web/scripts/sync-institute.mjs`) copies this tree to `web/public/data/institute/`
for dev/runtime fetch; the large parts (lesson bodies, atlas chunks) are pushed to **R2** under
`institute/` by a new `npm run deploy-institute` target. Route pages `getStaticPaths` over
`manifest.json` and lazy-fetch lesson bodies client-side (same pattern as the atlas already uses).

**Size estimate:** 511 lessons × ~8 KB prose + 4 code files ≈ 12–18 MB for AISF; atlas ≈ 6 MB
already chunked. Both R2-served, lazy-loaded. Nothing new ships in the Worker asset bundle.

---

## 4. The interactive engines

Two engines, both **first-party TypeScript, framed as Astro islands, CSP-clean** (hashed inline
bootstrap or external hashed module; no `eval` except inside the sandboxed worker).

### 4.1 The Code Lab  (AISF lessons + "check understanding")

freeCodeCamp-style split view, rebuilt from scratch:

| Part | Implementation | Notes |
|---|---|---|
| **Editor** | CodeMirror 6 (self-hosted, MIT), or a lean custom editor if CM6 can't be made CSP-clean | Syntax modes: JS/TS, Python, HTML/CSS, Rust/Julia (read-only highlight) |
| **Run — JS/TS** | Sandboxed `<iframe sandbox>` + Web Worker; console captured and piped to a console pane | |
| **Run — Python** | Pyodide (self-hosted wasm in R2, loaded on demand), stdout/stderr captured | ~6 MB wasm — lazy, cached, only on lessons that need it |
| **Preview** | `srcdoc` iframe for HTML/CSS/JS lessons; live re-render on edit (debounced) | |
| **Console** | Captured `console.*` + thrown errors, timestamped, clearable | |
| **Tests / checks** | Per-lesson `checks[]`: assertion functions run in the worker against the learner's code; pass/fail list with hints | **Client-attested** (model B) — completion posts a boolean to `/api/progress`, same trust level as today's "lesson done" flag. No answer keys to leak. |
| **Reset / solution** | Restore starter; reveal reference solution (from AISF `outputs/` or `code/`) | |
| **Rust / Julia** | Shown read-only with copy + "run locally" instructions | No credible in-browser runtime |

### 4.2 The Terminal Dojo  (sikhi.io `/ai`, `/code`)

A faithful port of `SikhCodeDojo.tsx` (command REPL, type `/`, arrow, tab-complete, scripted
demo) and `SikhCodeTerminal.tsx` (auto-typing IDE that types a file out with live line-notes),
plus `dojoAnim.ts` (the rAF sequencer). Port target: ~2 vanilla-TS modules + a small CSS file,
no React. The CRT/scanline overlay and keyframes come across as plain CSS. Emoji in the source
headings (🧠 💻 ❯ ✓) are replaced with the IoT drawn-glyph set per `DESIGN.md`'s no-emoji rule,
**except** ੴ, which is content, not chrome, and stays.

### 4.3 The Atlas  (sikhi.io `/opensource`)

Port the chunked-fetch directory UI (index + 250-repo chunks + lazy search.json) and the
GitHub-OpenGraph-card grid verbatim in behavior; restyle to the IoT system. Rebuild
`scripts/build-opensource.mjs` as `web/scripts/build-atlas.mjs`. The "Cloud Codes" video shelf
stays as YouTube embeds (allowed) with attribution.

---

## 5. Design direction — "the futuristic classroom"

**To be finalized by `/design-consultation`, then pressure-tested by `/plan-design-review`.**
Starting hypothesis, for the consultation to accept, sharpen, or replace:

- **The feeling:** you leave the warm, papery, reverent university and step through a threshold
  into a bright, precise, engineered room. Calm, not loud. "Lab", not "arcade". The main campus
  says *reverence*; the Institute says *craft*.
- **Ground & light:** deep near-black / ink-blue ground (`#070B14`-family, already the sikhi.io
  dojo ground), thin luminous rules, generous negative space. One structural accent
  (candidate: a cool cyan or a signal-amber — amber ties to the existing "Sikh Code" identity).
  Semantic green/red reserved for test pass/fail.
- **Type:** self-hosted monospace for code and UI-data (JetBrains Mono / IBM Plex Mono); the
  existing Source Serif 4 stays for long-form lesson prose so reading a lesson still feels like
  the university. Gurmukhi faces unchanged and still first-class.
- **Motion:** the *signature* motion is **typing** — text that assembles itself — used with
  restraint. Hover lifts, a scanline whisper on terminals, a threshold transition on
  `/institute` entry. All behind `prefers-reduced-motion` (which shows completed text instantly).
- **Icons:** one drawn line-set in the IoT voice (technical, geometric), `currentColor`. No emoji
  as chrome (`DESIGN.md` law).
- **Certificate:** a distinct IoT certificate face — **"Sikhi University"** wordmark top,
  **"Institute of Technology"** beneath, then the program completed (e.g. *"AI Engineering —
  Phase 7: Transformers Deep Dive"* or *"Sikh Code — Foundations"*). Same verification spine
  (`/verify`, signed, public) as the university certificate.
- **The booths (§7):** each *deliberately breaks* the IoT system to mimic its source — freeCodeCamp
  dark-green + its cube, Class Central its blue, Libre.academy its vintage-sci-fi orange. The
  "college fair" effect is the point: consistency is the hall, not the booths.

Deliverables from the design phase: font + color specs, the threshold/entry treatment, the
lesson-page layout (prose + lab), the catalog layout, the certificate face, and the three booth
skins — as preview artboards for founder review.

---

## 5·5 Design review additions (2026-08-28, `/plan-design-review`)

### Information hierarchy — the three screens that matter

**`/institute` (the threshold).** First: the "you have entered" moment + one thesis line
(≤14 words). Second: **one** primary action — *Continue where you left off* for a returning
student, *Start with Phase 0* for a new one (never both loud). Third: the 20-phase spine as a
quiet numbered list + a single "Explore free courses elsewhere →" link to the fair. Nothing
else above the fold. The power-on motion is the only flourish.

**`/institute/catalog`.** Constraint: a student can hold ~3 groups in their head, not 24.
Top: *Your tracks* (enrolled/in-progress, with progress bars). Middle: *AI Engineering —
20 phases* as a dense monospace table (number · title · lessons · your progress), collapsed
by default past phase 3. Bottom: *Sikh Code* (the 2 dojos + the guide) and *The Atlas*.
The fair booths are **not** in the catalog — they live only at `/institute/explore`.

**`/institute/lesson/[...path]`.** Two-column on desktop: prose left (~68ch, serif), the
Code Lab right (sticky). Prose owns the hierarchy — objective → concept → build → check.
The lab is secondary until the student reaches a "try it" block, which scrolls the lab into
focus. Lesson nav (prev/next within phase) is a persistent bottom rail, never a sidebar.

**Returning student lands on** their last in-progress lesson (not the campus) when one
exists; `/institute` otherwise. A one-line "resume" toast, dismissible.

### Interaction states (the table the plan was missing)

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| **Code Lab — editor** | skeleton lines, ~150ms | starter code always present (never blank) | "editor failed to load — here's the code as plain text" + the snippet | — | — |
| **Code Lab — Python run** | "Starting Python… (one-time, ~6 MB)" progress bar on first use; "Running…" after | — | stderr verbatim in console, red; "Python failed to start — check your connection, or read the solution" | green console + `exit 0` + timing | timeout at 10s → "still running — stopped it; infinite loop?" |
| **Code Lab — checks** | "Checking…" inline | — | check threw → "couldn't run the checks — try Run first" | all green + a quiet "lesson complete" that advances the bottom rail | "2 of 3 — [which one] still failing" + the hint for that check |
| **Code Lab — Rust/Julia** | — | — | — | — | permanent state: read-only editor, "Run locally" panel with the exact command, copy button |
| **Terminal dojo** | boot sequence types in | — | unknown `/command` → in-world error + "type /help" | — | demo playing → "press any key to drive" pulse; user typing → demo stops |
| **Atlas — chunk** | 250-card skeleton grid | — | chunk fetch fails → "couldn't load this page — retry" | cards fade in | dead repo (OG card 404) → typeset nameplate fallback (keep the sikhi.io behavior) |
| **Atlas — search** | spinner in the field | "nothing matches '[q]' — try a language or a broader term" | — | result count + cards | — |
| **Catalog card** | — | not enrolled → "Start"; done → "Review" + seal | — | in-progress → progress bar + "Continue" | gated cohort → lock glyph + "Opens [date] / request access" |
| **Certificate** | — | not yet earned → greyed cert + "finish the phase exam (≥80%) to unlock" | verify endpoint down → "can't verify right now" | full cert + Download + verify link | — |
| **Booth** | — | — | outbound link only — no failure state on our side | — | — |

Empty states carry warmth + one action, never "No items found."

### User journey — the arc

| Horizon | What the student does | What must be true | Plan support |
|---|---|---|---|
| **5 sec** | crosses the threshold | it feels like a different room, and it's obvious what to click | power-on motion (once/session), one primary action, thesis line |
| **5 min** | reads lesson 1, writes code, hits Run, sees green | the first success is fast and unmistakable | starter code pre-filled; checks give the green moment; Python cost paid once with an honest progress bar |
| **first stumble** | fails the same check 3+ times | they get unblocked without feeling dumb | after 3 fails the specific hint auto-expands; "reveal solution" appears; no scolding copy |
| **Rust lesson** | wants to run it, can't | the limit feels deliberate, not broken | read-only lab state with the exact local command + why, not a greyed-out mystery |
| **5 year** | a working engineer returns for Phase 14 | the depth is real and the room respects their time | dense monospace catalog, no marketing padding, deep-link to any lesson |

### Hard design rules (AI-slop guard — mirrored into `DESIGN-INSTITUTE.md`)

1. **Cyan (`--signal`) is never decorative.** It marks exactly one thing: *this is live /
   running / correct*. Cyan on a static element = reject the diff.
2. **No colored left-border on cards.** (The preview artifact used it; production must not.)
   Panels get a full hairline box + a monospace corner-label.
3. **The bench-grid texture** stays ≤ 0.3 opacity, top-masked, never behind reading text.
4. **The dot-matrix face** appears only in the wordmark, phase numbers, and the certificate
   heading. Never a paragraph, never a button.
5. **One accent, one signal, dark neutrals.** No third hue except `--plum` (500-level marker
   + syntax keyword).
6. **No emoji as chrome.** Terminal glyphs `❯ ✓ ✗` are allowed *inside terminal/console
   surfaces only*; elsewhere use the drawn IoT icon set. ੴ is content and stays.

### Responsive & accessibility specs

- **Code Lab < ~760px — DECISION D5.** Recommended: a segmented control (Code / Preview /
  Console) swapping one full-width pane; check results as a bar above the segments; "Run" a
  persistent bottom-fixed button; editor stays real (CodeMirror mobile), not read-only.
- **Terminal dojo < ~760px:** file-tree collapses to a `▸ files` disclosure; editor +
  terminal stack; status bar drops to two fields; the auto-play demo still runs.
- **Atlas < ~760px:** 1-col cards; language filter becomes a `<select>`.
- **CodeMirror a11y:** editor is a labelled ARIA textbox; check results + run output announce
  via `aria-live="polite"`; every lab control keyboard-reachable with a `--signal` focus ring.
- **Contrast (verify Wave 1, AA on `--ground #090D18`):** `--muted`, `--ink-dim`, `--filament`
  as text, `--signal` as text, and **Noto Serif Gurmukhi at `--ink`** — Gurmukhi never
  smaller than adjacent Latin (root `DESIGN.md`).
- **Reduced motion:** power-on suppressed, typing resolves instantly, no scanline, static caret.
- **Light theme — DECISION D7.** Dark-only is a step down from the site toggle. Recommended:
  ship a "lights-on" light token set at launch (token-only, no component changes) and honor
  both the manual toggle and `prefers-color-scheme`.

### What already exists (reuse, don't rebuild)

- `web/src/layouts/Base.astro` — extend with an `institute` prop that swaps the token block,
  nav, and sets `autoTranslate={false}`. Do not fork.
- `web/src/pages/course/[id].astro` — the lesson-render pattern (`set:html` prose,
  `getStaticPaths` over a manifest, server-graded quiz POST) is the `/institute/lesson` template.
- `functions/api/quiz.js` + `_quiz-keys.js` — the server-grading spine; add
  `_institute-quiz-keys.js`, don't rebuild.
- `cert.astro`, `/verify`, the signing path, and the **drawn verification seal** — reuse the
  seal as-is (DECISION D10: same seal, dark card).
- `web/public/fonts/` + `fonts.css` — the self-host pipeline; add faces here.
- Root `DESIGN.md` **a11y gates, seal rule, and Gurbani reverence rules are non-negotiable**;
  IoT overrides only palette, type, motion, layout density.

### NOT in scope (deliberately deferred)

- A native/offline app for the Institute (the PWA offline-lesson path may extend later).
- In-browser Rust/Julia execution (no credible runtime; read-only + local instructions).
- Server-side execution of challenge tests (model B: client-attested).
- Course-content translation for IoT lessons (English-authoritative, like the main courses).
- Redesigning the main university to match (the blend runs one direction only).

## 5·7 DX / learner-experience review additions (2026-08-28, `/plan-devex-review`)

The "developer" here is the learner. Two personas: **a first-time coder** (never written
a line) and **a working engineer** after the AI/agent phases (11–19). "World-class /
premium" in DX terms = nothing makes you wait without saying why, errors help instead of
scold, the machine feels alive, you are never lost.

**Time-to-first-win estimate — the plan as written scores poorly for the first-timer.**
AISF's Phase 0 is *"Setup & Tooling"* — 12 lessons about installing Python, Node, Rust,
uv, Docker on your own machine. That is the opposite of a fast first win, and our in-browser
lab makes most of it unnecessary for the early phases. A first-timer who lands on
`/institute`, clicks "Start Phase 0", and hits *"xcode-select --install"* on lesson 1 (on
a phone) bounces. AISF's own site routes people past this by goal.

### Decisions needed (X1–X7)

| # | Issue | Recommendation |
|---|---|---|
| **X1** | The new-student primary action is "Start Phase 0" (a local-setup slog). | **Make it "Write your first line of code"** → a single zero-setup JavaScript taster in the lab (drawn from `coding-fundamentals.ts`). First "green" in under 60 s, no download. Phase 0 becomes *"when you're ready to work on your own machine"* — optional, not the gate. |
| **X2** | Pyodide is ~6 MB on the first Python lesson — a 10–30 s wait right in the abandon window, worse on mobile data. | **Prefetch Pyodide during the 2.4 s power-on** when the manifest says the student's next lesson needs it; and make lesson 1 of every Python phase JS-or-no-code so the first green is instant. Frame the load as *"warming up the lab"*, never *"downloading 6 MB"*. |
| **X3** | `/institute` shows the 20-phase list; a first-timer sees "511 lessons, where do I start?" | **Reproduce AISF's goal router** on `/institute`: *I'm new · I know Python · I want to build agents · I want MCP* → each drops the student at the right lesson. Proven on the source site. |
| **X4** | Typing a whole code file on a phone keyboard is genuinely bad; first-timers are often on phones. | **A mobile snippet toolbar** (`()` `[]` `=` `"` `:` `→`) above the keyboard, and **fill-in-the-blank** entry for the earliest lessons (type the missing token, not the whole file). freeCodeCamp added exactly this. Full free-typing for later lessons. |
| **X5** | An experienced engineer must walk every lesson in a phase to reach its exam. | **A fast path:** let a signed-in student open the phase exam directly. Still ≥ 80 % to pass and earn the cert — the credential stays honest, the engineer's time is respected. |
| **X6** | Progress sync covers lesson-done flags, not the editor buffer. Close the tab mid-exercise → your code is gone. | **Autosave the editor buffer to `localStorage` per lesson** (`iot_v1_buf_<lesson>`). Cheap, and it is table stakes for a premium tool. Server sync not needed. |
| **X7** | No way to find a lesson by memory ("the one about attention") across 511. | **Client-side lesson search** over the manifest (title + objectives), on `/institute` and in the catalog. The manifest is already loaded; ~1 KB of index per phase. |

### Clear fixes (folded in — no decision)

- **The "you did it" beat.** After the first lesson's checks all pass, a quiet one-line
  acknowledgement — *"you just wrote and ran a real program"* — within the whisper-motion
  budget. First-timer confidence is the whole game in the first five minutes.
- **Progress-to-certificate surfacing.** The track page shows *"3 lessons and the exam from
  your Phase 7 certificate"* — earned credentials should feel close, not abstract.
- **Prerequisites are a soft gate.** `PREREQ: PHASE 03` on a card warns on entry, never blocks.
- **Brittle-check grace.** When a check fails but the student's code *ran*, show *"your code
  works — the check expects X, here's why"* with partial credit, plus a "this check looks
  wrong" link to the feedback page. AISF checks can be strict.
- **"Run it locally" toggle** per lesson (engineer path + Rust/Julia from E8): full code +
  the exact repo path + command, so an engineer who prefers their own editor is not fighting
  the lab.
- **Deep links everywhere** (`/institute/lesson/[...path]` already gives this) — an engineer
  shares a single lesson URL, it opens to that lesson, not the catalog.

### TTHW target

- **First-timer:** land → "write your first line" → type one line → Run (JS, no download) →
  output. **Champion tier, < 2 min** — achievable only if X1 + X2 land.
- **Engineer:** land → goal router "I want agents" → Phase 14 lesson 1 → read → run → green.
  **Competitive tier, ~3–4 min.**
- Without X1/X2 the first-timer path is *Red Flag tier (> 10 min + a local-setup wall)*.

## 5·8 CEO / strategy review additions (2026-08-28, `/plan-ceo-review`, SELECTIVE EXPANSION)

**The premise challenge.** The content is not ours and is not the moat — AISF, freeCodeCamp,
and boot.dev already teach this, free and well. If the Institute is "a worse-integrated
freeCodeCamp mirror," it is scope-creep on sikhiuni's Sikhi mission and a large permanent
maintenance surface. It is worth building **only if the community wedge is real and stated.**

**The wedge (C1 — adopt as the stated "why us"):** *the Sikh community's own institution now
teaches the skills that pay — inside a platform its youth already trust and belong to, framed
by kirat karni and seva, and pointed at building for the Panth.* freeCodeCamp cannot be that.
The 12-month ideal is not "freeCodeCamp for Sikhs" — it is the pipeline that produces the
people who build the next sikharchive, the next gurdwara system, the next Punjabi-learning
tool. Every scope call below is judged against that pipeline.

### Implementation approaches considered

| | Approach | Effort | Risk |
|---|---|---|---|
| A | Full faithful import (the plan as written) — all 20 phases, 4 languages, 2 engines, atlas, 3 booths | XL | Med — maintenance surface + the premium/imported-content gap |
| **B** ✅ | **Minimum Lovable Institute** — goal router + Phases 0–3 + 11 + 13 + 14 + a capstone; **both engines + both dojos + the guide built in full** (they are the moat); **1 booth** (freeCodeCamp). ~150 lessons. Validate with a real cohort, then depth waves 4–10 / 12 / 15–19. | L | Low |
| C | Curated original track (~40 lessons in our voice), AISF as a "go deeper" link, no import | M | Med — 40 lessons doesn't feel like a university; content bar is on us |

**Recommendation: B.** It is the ideal architecture and the minimal-viable at once — the
engines (the real differentiator) ship complete, the content ships as a lovable slice, and
the wedge gets tested before we commit to maintaining 511 imported lessons.

### Decisions needed (C1–C8)

| # | Decision | Recommendation |
|---|---|---|
| **C1** | State the wedge in §0. | **Adopt** the "community's own institution → build for the Panth" thesis as the plan's stated why-us. Without it this is a mirror. |
| **C2** | Ship shape. | **Minimum Lovable Institute (Approach B).** Re-sequence Waves: MLI first (router + ~7 phases + full engines + dojos + guide + freeCodeCamp booth), soft-launch to a real cohort, then the remaining phases + atlas + booths as depth waves. |
| **C3** | A **"Build for the Panth" capstone track** — our own ~5 project briefs + starter repos (a Gurbani search tool, a gurdwara event board, an archive-OCR helper, a langar inventory app, a Punjabi-learning bot). | **Add to scope.** This is the thesis made concrete and the one thing freeCodeCamp structurally cannot have. S/M effort (briefs + starters). |
| **C4** | **Seva-framed phase intros** — one paragraph per phase, in the university's voice, connecting the skill to kirat karni / honest work. Not preachy. | **Add to scope.** S effort, and it is what makes a faithful import read as *ours*. |
| **C5** | **Editorial investment on the first ~10 lessons** — our intros, our diagrams, tuned lab exercises, the "you did it" beats — even if lessons 11–150 are a cleaner import. | **Add to scope.** Premium is set in the first ten minutes; spend the editorial budget there, not spread thin. |
| **C6** | Launch. | **Soft-launch to one real cohort** (a gurdwara youth group or a handful of students) behind `noindex`, iterate on their friction, *then* promote from the homepage. Not "noindex until Wave 8 then broad promote". |
| **C7** | Data model: authored content vs. imported. | **Split `imported/` and `ours/`** in `web/src/data/institute/` (keyed by lesson id). An AISF re-sync only touches `imported/`; our intros, checks, and exercises in `ours/` are never clobbered. (Also an eng concern — see §10·5.) |
| **C8** | The 12,500-repo **Atlas**. | **Defer to a depth wave** (or drop). It is the least "premium classroom" and most "firehose" thing in the plan, it already lives on sikhi.io, and it does not serve the pipeline. Link to sikhi.io's `/opensource` for v1. |

### Certificate positioning (folded in — no decision)

IoT certificates are **verifiable completion records** for the learner and the community —
"a record of what you finished," publicly verifiable at `/verify`. Copy must not imply
industry or employer recognition the credential does not have. The "graduates who build"
wall (an opt-in directory, C3-adjacent) is where the credential earns community weight over
time.

### The `/institute/explore` hall (folded in)

Three outbound "go learn elsewhere" doors on a brand-new section can read as "we don't have
much here." The hall must be visibly **secondary** — a "when you want breadth / have
outgrown us" wing, one booth for MLI (freeCodeCamp), never co-equal with the Institute's
own courses in nav weight or catalog placement.

## 6. Licensing & legal — making it airtight

New page `/institute/licenses` (and an entry in `docs/CONTENT-AND-LICENSING.md`), plus a
per-course footer credit, plus a Terms addendum. Every claim below gets a citation on that page.

### 6.1 AI Engineering from Scratch — MIT

- **License:** MIT, © the AISF authors. We **retain the full MIT license text** in
  `web/public/data/institute/LICENSES/aisf-MIT.txt` and link it from every AISF course and from
  `/institute/licenses`.
- **Attribution:** **Rohit Ghumare** is listed as the **professor** on all 20 AISF phase-courses,
  with a bio, photo, and a link to the source repo + `aiengineeringfromscratch.com`. The
  `/institute/licenses` page states: *"The AI Engineering curriculum is adapted from 'AI
  Engineering from Scratch' by Rohit Ghumare, used under the MIT License. Modifications: reformatted
  into Sikhi University's course structure, quizzes and lab checks integrated."*
- **Trademark / endorsement:** no AISF logo; a line stating Sikhi University is not affiliated with
  or endorsed by the project.
- **Our modifications** (structure, lab checks, quiz assembly, styling) are ours; the curriculum
  text stays under MIT. IoT-original wrappers (track intros, our lab checks) are offered **CC BY-SA
  4.0** to match the university's open-content posture.

### 6.2 sikhi.io content — ours

- `coding-fundamentals.ts`, `ai-coding.ts`, `claude-code.tsx`, `opensource.tsx` and the dojo
  engine are in **`redroyals/sikhi.io`, owned by the founder**. Moved into this repo under our
  own license (**CC BY-SA 4.0** for prose, **MIT** for engine code), professor credit
  **"Sikhi University · Sikh Code"**.
- `ai-coding.ts` is *synced from* `code.claude.com/docs` — it teaches Claude Code's real command
  set. Keep the "synced to the docs" footnote and a docs link; no Anthropic branding beyond
  nominative use.
- Atlas repo metadata (names, descriptions, stars) is factual + from public GitHub; the video
  shelf is YouTube embeds. Attribution to the "Cloud Codes" channel and to GitHub retained.

### 6.3 freeCodeCamp — booth only (no rehosting)

Explain in full on `/institute/licenses`:

- **Platform code:** BSD-3-Clause, © 2014 freeCodeCamp. We reuse **none** of it. If any snippet is
  ever borrowed, the notice + "no endorsement" clause travel with it.
- **Curriculum & instructional content:** **CC BY-SA 4.0**. Because the booth **links out and
  rehosts nothing**, share-alike is not triggered. If we ever quote a sentence of their prose on
  the booth, that quote is attributed and the booth page carries a CC BY-SA 4.0 notice.
- **Trademark:** "freeCodeCamp" and the logo are trademarks of freecodecamp.org (a 501(c)(3)).
  The booth uses the name nominatively, **carries no partnership claim**, and shows:
  *"Lecture companions and links to the freeCodeCamp® curriculum. Sikhi University is not
  affiliated with, sponsored by, or endorsed by freeCodeCamp.org. Certifications are issued by
  freeCodeCamp."*
- **No Sikhi University certificate** for freeCodeCamp work.

### 6.4 Class Central — booth only

- Booth links to `classcentral.com`. **No scraping, no imported listings, no editorial text
  copied.** One line crediting Class Central as a course-discovery aggregator. Their name is a
  trademark of Class Central SL — nominative use, no endorsement claim.

### 6.5 Libre.academy — booth only

- Booth links to `libre.academy`. `/institute/licenses` explains why we don't rehost: the app is
  MIT but the ~100 course packs derive from separately-licensed books, several **non-commercial or
  no-derivatives** (Eloquent JavaScript CC BY-NC, You Don't Know JS Yet CC BY-NC-ND, Pro Git
  CC BY-NC-SA, JavaScript.info, Automate the Boring Stuff CC BY-NC-SA). Honoring NC/ND is a
  `CONTENT-AND-LICENSING.md` hard rule.

### 6.6 Documents to add / update

- **New:** `web/src/pages/institute/licenses.astro` (human) + `LICENSES/` text files.
- **Update:** `docs/CONTENT-AND-LICENSING.md` (add the IoT rows), `docs/DATA-LICENSE.md` (IoT
  catalog metadata joins the CC BY 4.0 open dataset), the site **Terms** page, `README.md`.
- **New:** `docs/ADR-0003-institute-of-technology.md` recording the architecture + licensing call.

---

## 7. The "college fair" booths — build spec

Shared frame: a page header ("Sikhi University · Institute of Technology / Explore"), a short
honest intro, and a big outbound CTA. Inside that frame, each booth is a **self-contained styled
region** that mimics its source:

| Booth | Mimic cues | Content |
|---|---|---|
| **freeCodeCamp** | fCC dark `#0a0a23`, its green `#99c9ff`/`#02be8c`, the "{ }" cube motif, Lato/Roboto-ish | What the curriculum covers, the ~15 certifications listed as outbound links, honest "certs are theirs" note, disclaimer |
| **Class Central** | Class Central white/blue `#5f37be`/`#e64b5f`, card grid feel | What Class Central is, how to filter for free + free-certificate courses, one outbound button |
| **Libre.academy** | Libre's near-black + halftone + burnt-orange `#e0734d`, mono display face, "vintage sci-fi" | What Libre is (books → guided exercises, local-first desktop app), download + web links |

All booth assets (colors, a couple of SVG motifs drawn by us) are first-party; **no logos, no
scraped screenshots**. Each booth links out with `rel="noopener"`.

---

## 8. Gradebook, quizzes, certificates

Reuse the existing spine (`docs/BACKEND-cloudflare.md`), extend minimally:

- **Courses:** each AISF phase is one course id `iot-aisf-<NN>-<slug>`; each dojo is
  `iot-dojo-<slug>`. They flow through the existing `progress` table (the roster spine),
  `enrollments` (`kind` gets `'institute'`), `course_teachers`, `grade_overrides`, `events`.
- **Lesson completion:** `POST /api/progress` with `{courseId, lessonIndex, done}` — unchanged.
  Lab "checks" passing is a client-attested `done` (model B), consistent with today's model.
- **Quizzes (AISF only):** the 361 `quiz.json` files are multiple-choice → assembled into a
  per-phase bank; the exam samples N (≈20). Graded **server-side** by `/api/quiz` against keys in
  a new `functions/api/_institute-quiz-keys.js` (generated by `web/scripts/build-institute-quiz-keys.mjs`,
  never shipped to the browser). Pass ≥ 80%. Same anti-forgery guarantees as the university.
- **Certificates:** `cert.astro` learns an `institute` variant (different face, §5); `/verify`
  and the signing path are unchanged. One certificate per AISF phase; one per dojo track. Dojos
  with no exam use a lightweight completion criterion (all topics viewed + a short check quiz we
  author, server-graded).
- **No D1 schema migration** is expected beyond an `enrollments.kind` value and possibly an
  `is_institute` boolean on a course-metadata table if one exists; confirmed during Wave 1.

---

## 9. Import & sync pipelines

All re-runnable, all committing generated data for review.

| Script | Does | Re-run when |
|---|---|---|
| `web/scripts/sync-aisf.mjs` | Clone/pull `rohitg00/ai-engineering-from-scratch`; walk `phases/**`; convert `docs/en.md` → sanitized prose HTML (mermaid preserved as `<pre class="mermaid">`, code fenced); pull `code/` for all 4 languages; parse `quiz.json`; emit `data/institute/tracks/*` + `lessons/*` | AISF repo updates |
| `web/scripts/build-institute-quiz-keys.mjs` | Assemble per-phase MC bank; emit browser-safe question file + server-only key file | after `sync-aisf` |
| `web/scripts/port-dojo.mjs` | Read sikhi.io `data/learn/*.ts` (checked-in copy) → `data/institute/dojo/*.json` | sikhi.io course edits |
| `web/scripts/build-atlas.mjs` | Rebuild the 12.5k-repo chunked directory + search index from the sikhi.io generator inputs | atlas refresh |
| `web/scripts/sync-institute.mjs` | Copy `src/data/institute` → `public/data/institute` (dev/runtime) | every build (wired into `prebuild`) |
| `npm run deploy-institute` | Push lesson bodies + atlas chunks to R2 `institute/` | after any content change, before/with deploy |

New CI validators (`web/scripts/validate-institute.mjs`): manifest ↔ files consistency, every
lesson has objectives + at least one check or quiz ref, no emoji in chrome, all external links
`rel="noopener"`, license file present for every wing, prose HTML passes the sanitizer allow-list.

---

## 10. Build waves

Each wave = a PR (or a short PR stack), green CI, founder-review checkpoint. Content waves fan
out to background subagents (the Sikh Archive course-wave pattern).

| Wave | Deliverable | Verify |
|---|---|---|
| **0 · Design** | `/design-consultation` → IoT design system; `/plan-design-review` on this doc; founder picks font + accent + certificate face + booth skins | Preview artboards approved |
| **1 · Spine** | `/institute` routes scaffold, IoT `Base`-variant layout, nav entry, monospace font added, `manifest.json` schema, `sync-institute` + validators wired into CI, `enrollments.kind` confirmed | `/institute` + `/institute/catalog` render empty-state; CI green; a11y pass |
| **2 · Code Lab** | Engine 4.1: editor, JS/TS run, console, preview, checks runner, reset/solution; Pyodide lazy-load path | Lab runs a hand-written JS + Python sample lesson end to end; `prefers-reduced-motion` OK; CSP clean |
| **3 · Terminal Dojo** | Engine 4.2 ported (dojo + terminal + sequencer + CRT CSS); `/institute/dojo/[slug]` | `/ai` and `/code` equivalents play + are drivable; keyboard + reduced-motion OK |
| **4a · AISF pipeline** | `sync-aisf.mjs` + `build-institute-quiz-keys.mjs` + golden-file tests; **Phase 0 only** imported end-to-end | Phase 0 lessons render; the phase exam server-grades; golden-file tests pass; sanitizer allowlist covers code blocks + figures |
| **4b–4e · AISF content** | remaining 19 phases in 4 batches via background subagents (Sikh Archive wave pattern); all 4 languages; 361 quizzes | Every lesson page renders; every exam server-grades; spot-review 1 lesson per phase; R2 pushed |
| **5 · Sikh Code + Guide + Atlas** | `coding-fundamentals` + `ai-coding` as dojo courses; `claude-code` guide; Open Source Atlas ported + restyled | All four pages QA'd; atlas chunk-fetch + search work; video embeds load |
| **6 · Gradebook + Certificates** | IoT courses in enrollments/gradebook/teacher scope; `cert.astro` institute variant; `/verify` unchanged; completion criteria for dojos | Earn + verify a cert on a test account for one AISF phase and one dojo |
| **7 · Booths + Legal** | 3 booths (§7); `/institute/licenses`; `docs/` + Terms + README + ADR-0003 updates | Legal review checklist (§6.6) complete; booths link out correctly; brand mimicry reads right |
| **8 · QA + polish** | `/qa` full-section pass (light/dark/mobile), `/design-review`, perf (lazy-load budgets), SEO (`noindex` thin pages, sitemap), `/canary` after deploy | Zero high-severity design/a11y findings; all routes 200; Lighthouse budgets met |

**Deploy:** each wave merges to `master`; §9 R2 pushes run with the content waves; full prod
cutover after Wave 8 (`wrangler deploy` + `npm run deploy-institute` + canary).

---

## 10·5 Engineering review additions (2026-08-28, `/plan-eng-review`)

Grounded in the real backend: `worker.js` (explicit import + route table), `functions/api/quiz.js`
(server-grades against `_quiz-keys.js`, a single flat `QUIZ_KEYS` object; upserts
`progress.passed_score = MAX(old,new)`), `progress.js` (`done` = capped JSON int array, score
never accepted here), `functions/api/_r2-serve.js` (`/media/*` served from `sikh-university-media`
R2 behind a key-prefix whitelist `^(santhya|audio|gurbani|media)/`), hash-based CSP with no
`unsafe-inline` in `script-src` (PR #188), and the `courses.json` precedent (45 MB, stripped
before `astro build`, served from R2, pushed by a separate `deploy-data` step).

### Decisions needed (E1–E7)

| # | Issue | Recommendation |
|---|---|---|
| **E1** | CodeMirror 6 injects `<style>` at runtime → fights the strict `style-src`. The plan defaults to CM6 with a lean fallback. | **Flip the default.** Start with a lean editor: a `<textarea>` + a Prism.js highlight overlay (Prism self-hosted, class-based static stylesheet, no `eval`, no runtime style injection). Add CM6 only if the lean one proves inadequate — "boring by default". |
| **E2** | Pyodide needs `script-src 'wasm-unsafe-eval'` (possibly `'unsafe-eval'`); the atlas needs `img-src opengraph.githubassets.com i.ytimg.com`; the preview iframe + worker need their own policy. This cannot live under the site's current strict CSP. | **Per-path CSP for `/institute/*` only.** `worker.js` already sets headers per path — give `/institute/*` a CSP that adds `'wasm-unsafe-eval'` to `script-src` and the two `img-src` hosts, and keeps everything else the site already forbids. The rest of sikhiuni stays byte-for-byte strict. Confirm a scoped CSP is acceptable (the alternative — one CSP everywhere — rules out in-browser Python). |
| **E3** | The plan adds `_institute-quiz-keys.js` but `quiz.js` only imports `QUIZ_KEYS`. | Keep the file separate; change `quiz.js` to `const key = {...QUIZ_KEYS, ...INSTITUTE_QUIZ_KEYS}[b.courseId]` (2 lines). Generators stay independent (Python for Sikhi, `.mjs` for IoT). |
| **E4** | AISF markdown has mermaid diagrams; the plan defers "render vs. omit" to Wave 4 and floats a client mermaid lib. | **Render mermaid to static SVG at build time** inside `sync-aisf.mjs` (mermaid-cli). Zero client library, zero CSP problem, zero runtime cost. The custom `figures-*.js` diagrams: import the ~12 with a mermaid equivalent, link the rest to source. |
| **E5** | The plan invents `web/scripts/deploy-institute` + a new `/data/institute/` route for R2. | **Reuse `_r2-serve.js`.** Add `institute` to the whitelist regex (`^(santhya|audio|gurbani|media|institute)/`); serve `institute/lessons/<phase>/<lesson>.json` + `institute/atlas/chunk-NNN.json` from the existing `sikh-university-media` bucket. `deploy-institute` = one `wrangler r2 object put` loop, same shape as `deploy-data`. Zero new Worker route code. |
| **E6** | Wave 4 ("all 511 lessons in one wave") is unshippable as a unit. | Split into 4a (pipeline + Phase 0 end-to-end, a hard gate) and 4b–4e (19 phases in batches via background subagents). Done above. |
| **E7** | The riskiest new code — markdown→sanitized-HTML, the lab check-runner, the ported dojo sequencer — has a CI schema validator but no unit tests in the plan. | Add: **golden-file tests** for `sync-aisf.mjs` (3–5 sample AISF lessons → committed expected HTML), **unit tests** for the check-runner (code + checks → pass/fail list) and the dojo sequencer (steps → frames). Written in the same wave as each engine, per the "well-tested is non-negotiable" bar. |

### Clear fixes (folded in — no decision)

- **Sandbox precisely.** The preview iframe is `sandbox="allow-scripts"` — **never** with `allow-same-origin` (the pair defeats the sandbox). User code + checks run in a **Web Worker**; the 10 s timeout is enforced by `worker.terminate()` on the main thread, not a flag inside the worker. Console/stdout cross the boundary by `postMessage` only.
- **`enrollments.kind`** — check `schema.sql` for a `CHECK` constraint before Wave 1; if present, it needs an `ALTER TABLE` migration to allow `'institute'`. If it's a bare `TEXT`, it's data-only.
- **Certificate issuance** stays on the existing path: a cert exists once `progress.passed_score >= 80` for the course id. AISF phases → the phase exam. Dojo tracks → a short authored check-quiz that also lands in `INSTITUTE_QUIZ_KEYS` (so "no exam" still means "server-graded", not "client-attested").
- **Deploy gotcha (from the `courses.json` "stale 331 courses" incident):** the build **strips** `public/data/institute/lessons/` + `atlas/` before `astro build` (asset-size limit), and `npm run deploy-institute` pushes them to R2 **separately**. A `wrangler deploy` that skips the R2 push ships an empty catalogue. This step is in the Wave-4 and Wave-5 verify columns.
- **Large pushes:** committing regenerated AISF JSON needs `git config http.postBuffer 524288000` (HTTP 400 otherwise — known repo gotcha).
- **Sanitizer allowlist delta:** `_sanitize-html.js` must additionally allow `<pre><code class="language-*">`, `<details><summary>`, `<figure><figcaption>`, `<img src>` (self/R2 only), and must **entity-encode, not strip**, `<`/`>`/`&` inside code text.
- **Atlas `img-src`:** covered by the E2 per-path CSP.

### What already exists (reuse — the plan mostly does; gaps noted)

- `functions/api/quiz.js` — server grading, `passed_score` upsert, gated-course fallback. **Reuse**; 2-line merge for E3.
- `functions/api/progress.js` — the roster spine; `done` array. **Reuse as-is** (IoT course ids just appear).
- `functions/api/_r2-serve.js` + the R2 whitelist — **reuse** for lesson bodies + atlas (E5). Plan currently rebuilds this.
- `functions/api/certificates.js` + `cert.astro` + `/verify` + the drawn seal — **reuse**; `cert.astro` gets a variant branch only.
- `functions/api/enrollments.js` — **reuse**; one new `kind` value.
- `web/src/layouts/Base.astro` — **extend** with an `institute` prop (per design review), don't fork.
- `web/src/pages/course/[id].astro` — the lesson-render + `getStaticPaths` + quiz-POST pattern is the `/institute/lesson` template.
- `scripts/validate.py` + `.github/workflows/ci.yml` `validate` gate — **extend** with `validate-institute.mjs`, same gate.
- `test/` + `vitest.config.mjs` — the home for the E7 tests.

### NOT in scope (deferred, with rationale)

- Server-side execution of lab code / challenge tests — model B (client-attested) stands; a sandboxed-Worker execution service is a separate project.
- Migrating `_quiz-keys.js` to a D1 table — the flat generated file works at ~600 courses; revisit past ~2000.
- CM6 rich editing (multi-cursor, LSP) — the lean editor covers lesson exercises (E1).
- A shared package for the two engines — they're different enough (REPL vs. bench); no premature abstraction.
- Incremental/partial R2 sync — full re-push per content change is fine at this size.

---

## 11. Risks & open questions

| # | Risk / question | Current call |
|---|---|---|
| R1 | CodeMirror 6 under strict hash-CSP (it injects styles) | Prototype in Wave 2; fall back to a minimal custom editor if it can't be made clean |
| R2 | Pyodide weight (~6 MB) on every Python lesson | Lazy-load once per session from R2, cache; show a "starting Python…" state; lessons without Python never fetch it |
| R3 | 511 lesson bodies + 4 languages inflate build/R2 | Per-lesson JSON, R2-served, lazy — Worker bundle unaffected; measured in Wave 4 |
| R4 | AISF prose has custom `figures-*.js` SVG diagrams (hundreds) | Import mermaid where present; render the JS figures as static fallback images or omit with a "see source" link — decided per-figure-type in Wave 4 |
| R5 | Dojo engine drivability (keyboard focus traps, mobile) | Port keeps the existing keydown model; add skip-link + `prefers-reduced-motion` instant-complete |
| Q4 | Do the dojo courses (`/ai`, `/code`) issue certificates, given they have no real exam? | Plan assumes yes, via a short authored check-quiz; founder to confirm |
| Q5 | `/claude-code` guide — standalone guide vs folded into an AISF phase | Plan keeps it standalone under `/institute/guide` |
| Q6 | Should `/institute` be indexed / promoted from the homepage now, or soft-launch | Plan: ship `noindex` until Wave 8, then promote |

### Design decisions (from `/plan-design-review`, 2026-08-28) — LOCKED by founder

| # | Decision | Locked |
|---|---|---|
| D1 | Display face | **Chakra Petch** (machined grotesk) as the single display face. No dot-matrix face. Phase numbers render in tabular JetBrains Mono. |
| D2 | Instrument cyan `--signal` as a 2nd accent | **Kept**, scoped hard to *live / running / correct*, never decorative |
| D3 + D7 | Theme | **Theme-aware, light + dark, both at launch.** Dark is primary; light is "lights on". Honors the site's `su_v1_theme` toggle and `prefers-color-scheme`. |
| D4 | Lesson prose face | **Source Serif 4** — a lesson still feels like class |
| D5 | Mobile Code Lab (< ~760px) | **Collapsible vertical stack** — editor stays visible on top; Preview + Console are collapsible sections beneath; checks bar under the editor; bottom-fixed Run |
| D6 | Threshold "power-on" | **Once per session** (`sessionStorage`), never on internal `/institute/*` nav |
| D8 | Rust / Julia in the lab | **Read-only editor + "run locally" panel** with the exact command; reference solution stays in context |
| D9 | Atlas (12.5k repos) entry | **Keep sikhi.io's model** (video shelf + repo firehose, unpaired); lead with search + a language filter rail |
| D10 | Certificate seal | **Same drawn five-surface seal** as `cert.astro` / `/verify`, rendered on the dark IoT card. One seal, one trust mark. |

---

## 12. Success criteria

- A student can enter `/institute`, feel they've walked into a different room, enroll in
  *AI Engineering — Phase 0*, write and run real code in the lab, pass the phase exam, and
  download a verifiable **Sikhi University · Institute of Technology** certificate.
- All 511 AISF lessons and the 4 sikhi.io courses are live, styled in the IoT system, and pass
  `/design-review` and `/qa` with zero high-severity findings in light, dark, and mobile.
- The three booths are live, each unmistakably echoing its source, each linking out cleanly.
- `/institute/licenses`, the Terms addendum, and `docs/` updates make every content right
  explicit and defensible; a reviewer can trace each wing to its license.
- The main university is untouched in behavior; nothing regresses; CSP, a11y, and deploy
  discipline hold.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | SELECTIVE EXPANSION. Wedge stated (C1). Ship shape = **Full Minimum Lovable Institute** (C2: phases 0/2/3/7/11/13/14 + both dojos + guide + capstone). C3–C8 accepted as recommended. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | E1–E7 accepted as recommended (lean editor · per-path CSP · quiz-key spread · build-time mermaid · reuse `_r2-serve.js` · Wave-4 split · pipeline+engine tests). `enrollments.kind` verified: bare `TEXT`, no CHECK — `'institute'` is data-only, no migration. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | 4.5/10 → 8.5/10; D1–D10 locked; `DESIGN-INSTITUTE.md` v1.0. |
| DX Review | `/plan-devex-review` | Developer / learner experience | 1 | clean | X1–X7 accepted as recommended (JS-first taster · Pyodide prefetch · goal router · mobile snippet toolbar · engineer exam fast-path · buffer autosave · lesson search). |

- **OUTSIDE VOICE:** Codex not installed; inline adversarial pass only. A `/codex` pass is still recommended before the engine waves (2 & 3).
- **SHIPPED (branch feat/*, PRs #226-244 + AISF import):** Wave 1 spine · SEO fixes · per-path CSP (E2, verified on prod) · Wave 2a Code Lab (JS+HTML, sandboxed, tested) · **Wave 4 AISF import — 149 lessons across 7 MLI phases (0/2/3/7/11/13/14), 738 quiz Qs, server-graded (`_institute-quiz-keys.js`, E3), mermaid rendered, `/institute/lesson/[...path]` + real track pages** · **Wave 7 — `/institute/explore` college-fair booth (freeCodeCamp skin, link-out only) + the legal pass (ADR-0003, licensing register, `/institute/licenses` our-additions block)** · **Wave 6 — the credential loop: `/api/institute-exam` (server-graded phase exam, ≥80%, sign-in gated, 8 invariant tests), `/institute/exam/[track]` (20 Qs sampled client-side from the bank), `/institute/cert` (dark D10 face, same drawn seal, mints a `/verify`-able id via `certificates.js`), `verify.astro` resolves phase names, track pages surface "sit the exam".** · **Wave 5 — the "Build for the Panth" capstone: 5 original briefs (`capstone/briefs.json`) — Gurbani search, gurdwara event board, archive-OCR helper, langar/seva coordinator, Punjabi-learning bot — each with seva framing, MVP vs stretch scope, phase-linked stack, real data sources, a "shipped looks like" bar, and a starter scaffold; `/institute/capstone/[slug]` + the capstone track view; `build-for-the-panth` flipped to published. No exam / no separate cert (phase certs are the credential).** · **Wave 3a — the Claude Code guide (`/institute/guide/claude-code`), ported from sikhi.io: 4 parts / ~25 sections / 20 Anthropic course links; `claude-code-guide` published.** · **Wave 3b — both Sikh Code dojos ported to vanilla TS + Astro islands (`lib/institute/dojo/{anim,terminal,repl,mount}.ts`, content `dojo/*.json`): the IDE-that-types-itself (`/institute/dojo/sikh-code-foundations`, 9 topics) and the Claude Code command REPL (`/institute/dojo/sikh-code-agentic`, ~30 commands, type `/` to drive). rAF sequencer unit-tested (E7); no-emoji-clean (terminal glyphs → ASCII); `prefers-reduced-motion` static fallback; both dojo tracks published. MLI content is now complete.** · **Wave 2c — Python in the lab: `lab-python.worker.ts` lazy-loads Pyodide v0.28.3 from jsDelivr (the `/institute/*` CSP already allowed `wasm-unsafe-eval` + jsdelivr), kept alive between Runs; the lesson page now renders an authored `<CodeLab>` from `ours/<track>/<slug>.json` (C7, never clobbered by re-sync) — a JS bench on `aisf-00-setup/data-management` (train/test split) and a Python bench on `aisf-02-ml/knn-and-distances` (euclidean + knn_predict from scratch), both verified pass/fail end-to-end.** · **/qa (2026-08-28): health 92/100; fixed PR #238 (breadcrumb run-together) + PR #240 (the Code Lab runner workers shipped under `/_astro/` so they inherited the strict site CSP — `new Function` and Pyodide's jsDelivr import were both blocked in prod; Vite now emits them to `/_lab/`, `run_worker_first` + `worker.js` give exactly those files a widened CSP; both JS and Python labs verified green on prod). Flagged, not fixed: CF edge-injected inline scripts (Rocket Loader) tripping CSP site-wide, nav overflow-clip < 1425px — pre-existing, not Institute regressions.** · **`/design-review` (2026-08-28, PR #242): reserved `--signal` cyan for "live/running/correct" only (D2) — content links were all cyan, now `--filament`, scoped to `<main>` so the shared nav/footer keep their own treatment; the goal-router cards had 3 alignments (grid auto-placement bug), now explicit `grid-area`. Flagged: the threshold hero is thin (founder design call), shared footer teal in dark mode.** · **`/review` (PR #243): verdict sound — SQL parameterized, keys server-side, `'unsafe-eval'` scoped to the 2 `/_lab/` worker files, user input `esc()`'d; one cleanup (dead `pyExpr` harness renamed).** · **`/cso` + fix (PR #244): closed an answer-key-reconstruction oracle in ALL THREE grading endpoints (`/api/quiz`, `/api/program-exam`, `/api/institute-exam`) — a failing attempt now returns only `{passed:false}` (score revealed on a pass only); 4 test suites updated, verified on prod. Residual LOW/INFO (Pyodide `js` proxy same-origin fetch — self-only; dojo style-attr `esc()` invariant) accepted.** Institute enrollment UI + dashboard "Your tracks" deferred (the loop needs no enrollment row); Prism syntax highlighting dropped (legible monospace as-is). **Full MLI complete; `/qa` + `/design-review` + `/review` + `/cso` passes all run.**

- **DEPTH WAVES SHIPPED (PRs #246-251, 2026-08-29, all squash-merged + on prod):**
  · **#246 nav overflow fix** — the shared site nav clipped its right-hand tail (theme toggle, auth) from ~768-1425px because it rendered at `md` but measured ~1425px. Desktop cluster + hamburger now switch at `xl` (1280); the inline search box (~250px, duplicated the ⌘K palette) dropped, ⌘K now a visible icon-button; `nav.search` added to all 8 i18n dicts.
  · **#247 threshold hero** — `/design-review` flagged it thin. Second column added: a monospace "bench read-out" panel (curriculum size off the manifest, code-lab languages, Sikh Code, the credential path) with `online` / `passing` states in cyan (D2). Rides the existing power-on session gate.
  · **#248 Class Central + Libre.academy booths** — the other two `/institute/explore` stands built, link-out only (Class Central = aggregator, no content used; Libre.academy packs are CC BY-NC/ND). Skinned per DESIGN-INSTITUTE §college-fair; `/institute/licenses` rows added; `deferred.booths` emptied.
  · **#249 the 13 remaining AISF phases** — 362 lessons → **511 total across 20 phases**. 8 carry a quiz bank and get a phase exam + cert (Math, Vision, NLP, LLMs-from-Scratch, Multi-Agent, Infra, Ethics, Capstone Projects); 5 publish as **reading tracks** — no quizzes upstream, so no exam/cert, an explicit note on the page (Speech, Generative AI, RL, Multimodal, Autonomous). Spine marks each `exam + cert` / `reading`. `deferred.phases` emptied. `sync-aisf.mjs` extended to all 20 phases.
  · **#250 seva-framed phase intros (C4)** — `ours/<track>/intro.json` for all 20 phases: the Institute's own voice on what the phase gives a Sikh engineer + a concrete Panth use (Gurbani search, archive OCR, Gurmukhi handwriting, kirtan transcription…). Track header lead = the intro; the AISF one-liner kept as a small "Upstream:" line. `validate-institute.mjs` now handles `intro.json` as a track-level sidecar.
  · **#251 Open Source Atlas** (`/institute/atlas`) — CEO C8 said defer-or-drop; reassessed and built because **100%** of the ~12,500 repos carry a "what you could build for the Panth" line. Committed data snapshot (`src/data/institute/atlas/`, ~3.8 MB, 51 chunks + search + video shelf, synced 2026-08-24), `sync-institute` copies it to `public/`, `build-atlas.mjs` is the maintainer refresh tool (fetches Tom Dörr's index + Cloud Codes feed; NOT in the build). Vanilla-TS island ported from sikhi.io's React page. **No CSP change needed** — `img-src https:` + `frame-src` youtube-nocookie already cover it.

**Deliberately NOT done in the depth waves:** build-time static-SVG mermaid (E4) — `mermaid-cli` works here, but every rendered SVG bakes in theme-specific colours (incl. shades mermaid derives per-diagram), so one static SVG can't read on both the dark and light Institute themes without fragile per-diagram-type post-processing; the current client-side render (lazy, from CSP-allowlisted jsDelivr, graceful fallback) picks the theme at runtime and is left as-is. The ~667 `figure` blocks already degrade honestly to "see the interactive version in the source"; converting ~12 to mermaid was judged <2% coverage at high authoring risk and skipped.

- **LAUNCHED (PRs #253-255, 2026-08-29, on prod):**
  · **#253 rename `/institute` -> `/technology`** — the wing's public URL now matches its "Technology" nav label. `git mv` the pages dir; every page-URL `/institute` -> `/technology`; `worker.js` 301s `/institute/*` -> `/technology/*` (sub-path + query preserved), kept in `run_worker_first`. Internal namespaces unchanged: `/data/institute/*`, `/api/institute-exam`, `lib/institute`, `components/institute`, the `institute` Base prop, the build scripts.
  · **#254 launch (founder C6 sign-off)** — `noindex` removed from every public `/technology` page (kept on `/technology/cert`, `/technology/exam/*`, `/technology/lab-demo`); new `sitemaps/technology.xml` (548 URLs: hub, sections, every track + lesson, dojos, capstone briefs, guide) in the sitemap index; a dedicated "Institute of Technology" band on the homepage after "Built for future" (four stat cards, CTAs to `/technology` + the Atlas).
  · **#255 lesson-content QA fix** — a sweep of all 511 lessons (all solid: 944-3694 avg words, zero thin/empty) found 3 markdown-import defects, fixed in `aisf-md.mjs` + `sync-aisf.mjs`: 79 `![](../assets/x.svg)` diagrams that 404'd -> `/technology-figures/x.svg` in a `<figure>` on a light card (79 SVGs copied to `web/public/technology-figures/`); `mAP@0.5` autolinked as `mailto:` -> unwrapped; ~20 dead `.../docs/en.md` cross-lesson links -> href dropped, text kept. 2821 external prose links now `target=_blank rel=noopener`.

**Remaining: nothing blocking — the wing is public. Watch a real cohort's friction and iterate (C6's original intent).**
- **VERDICT:** ALL FOUR REVIEWS CLEARED. Plan approved 2026-08-28. 
NO UNRESOLVED DECISIONS
