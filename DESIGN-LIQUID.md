# DESIGN-LIQUID: the liquid glass system for Sikhi University

One design language for sikhi.io, Sikhi University and Punjabi University. The glass recipe, motion, type scale, spacing and progress model are shared; each site keeps its own colours and brand. This file is Sikhi University's copy. The family reference is sikhi.io's `DESIGN-LIQUID.md`, `styles/liquid.css` and `lib/progress/path.ts` (branch `my-path`).

**Status (branch `redesign-liquid-glass`, local only, never pushed or deployed):** tokens, components, both shells, the "My path" dashboard and the restyled home, catalogue and course pages are built. The repo's gates pass (see section 9).

## 1. How this sits beside DESIGN.md

`DESIGN.md` (the registrar's ledger) stays the contract for content, type faces, Gurmukhi, icons, i18n and the reverence rules. This file changes one thing in it, on the owner's direction ("glass, liquid, company"): **surfaces**. The ledger said "do not add any new glass surface"; the liquid layer replaces that rule with the budget in section 3. Everything else in `DESIGN.md` still holds, and where the two disagree on anything but surfaces, `DESIGN.md` wins.

What Sikhi University keeps as its own:

- **Ground:** warm paper (`#fbf8f1`) in light, the existing midnight paper in dark. sikhi.io is dark only; this site follows its own light and dark switch.
- **Ink and brand:** navy headings, the heraldic crest, the University Gothic wordmark, the navy top bar.
- **Accent:** indigo (`#2f44a8` light, `#c4b5fd` dark, the value sikhi.io's file reserves for this site) for progress and selection. **Gold stays the one call to action.**
- **Type:** Inter for display and body, IBM Plex Mono for eyebrows, Noto Serif and Noto Sans Gurmukhi. No new font is loaded.

## 2. Tokens

All in `web/src/styles/liquid.css`, namespaced `--lq-*`, scoped under `.lq` (set on `<body>` by `Base.astro` with `data-lq-site="sikhiuni"`). Names match sikhi.io so a component reads the same on every site.

| Group | Tokens |
| --- | --- |
| Ground | `--lq-bg-0`, `--lq-bg-1`, `--lq-reading-bg` |
| Ink | `--lq-ink`, `--lq-ink-2`, `--lq-ink-3` |
| Accent | `--lq-accent`, `--lq-accent-strong`, `--lq-accent-rgb`, `--lq-on-accent`, `--lq-good` |
| Gold (this site) | `--lq-gold`, `--lq-gold-strong`, `--lq-gold-rgb`, `--lq-on-gold` |
| Glass | `--lq-glass-backing`, `--lq-glass-tint`, `--lq-glass-tint-blur`, `--lq-glass-tint-shell`, `--lq-glass-face`, `--lq-glass-filter`, `--lq-rim`, `--lq-hairline`, `--lq-depth`, `--lq-track`, `--lq-wash` |
| Shape and space | `--lq-r-sm` 12, `--lq-r-md` 18, `--lq-r-lg` 26; `--lq-s-1` to `--lq-s-7` on a 4 px grid |
| Type | `--lq-t-display`, `--lq-t-title`, `--lq-t-body`, `--lq-t-small`, `--lq-t-micro` |
| Motion | `--lq-spring`, `--lq-fast` 160 ms, `--lq-base` 260 ms, `--lq-slow` 380 ms |

The ledger's 3 px radius remains on ledger components. Liquid components use the three liquid radii.

## 3. The glass recipe

A glass surface has five layers: a translucent tint, a faint diagonal face gradient, a lit rim (a 1 px inner highlight and an inner line), an outer hairline, and soft depth below. Behind it, three slow light fields (gold, indigo, a cool blue) drift on a fixed layer (`.lq-field`), 48 to 76 seconds per pass, transform only.

| Class | Use | Backdrop blur |
| --- | --- | --- |
| `.lq-glass` | Cards and tiles, anything in a list | No. A tint only, free to scroll. |
| `.lq-glass--blur` | A few large, fixed-size surfaces | Yes |
| `.lq-glass--sheen` | Adds the pointer-following highlight | n/a |
| `.lq-reading` | Lesson text and Gurbani | Never. Solid and still. |

**Blur budget.** Live `backdrop-filter` is allowed on: the top bar, the rail (wide), the tab bar and lesson dock (narrow), the "next step" card on My path, and the sticky catalogue search. Nothing in a scrolling list is blurred: the 558 catalogue rows and every tile use the plain tint.

**Restraint.** Lesson prose sits on `.lq-reading`-style solid surfaces. `blockquote.gurbani` keeps the ledger treatment. No glass, sheen or motion is ever placed behind or on a line of Gurbani.

## 4. Components

CSS in `liquid.css`; behaviour in `web/src/lib/liquid.ts`.

- **Buttons** `.lq-btn`, `--primary` (gold, the one call to action), `--accent`, `--quiet`, `--icon`. 44 px minimum, real `<button>` or `<a>`.
- **Chips** `.lq-chip`, `--accent`, `--good`.
- **Progress ring** `.lq-ring` (SVG, value also given as text and in `aria-label`), **bar** `.lq-bar`, **week dots** `.lq-dots` (active, rest day hatched, today outlined in gold).
- **Celebration** `.lq-celebrate`: one glow, once, on a milestone reached since the last visit. No confetti, no sound.
- **Layout** `.lq-cols--hero/2/3/main`, `.lq-tiles`, `.lq-shelf` (a snap shelf on narrow screens, a grid on wide).

## 5. Two shells, switched at 1024 px

**Wide (1024 px and up): a command centre.**

- A persistent glass **rail** (`components/Rail.astro`, 84 px): Home, My path, Courses, Departments, Santhya, Search and Shortcuts. Real links, works without JavaScript.
- The navy glass **top bar** keeps the full menu from 1360 px; below that its hamburger carries it, and the rail carries the five main places.
- **Keyboard:** Ctrl or Cmd K opens the existing command palette; G then H, P, C, D or S goes to a place; J and K step through lessons on a course page; ? lists the shortcuts.
- Multi-pane where it helps: the course page keeps its outline in a sticky glass rail beside the lesson; the catalogue keeps its subject filter in a sticky glass rail beside the list; My path puts milestones and the timeline beside the main column.

**Narrow (below 1024 px): an app shell.**

- A floating glass **tab bar**: Home, Courses, My path, Santhya, Departments. It hides while the keyboard is up.
- **Large title that collapses:** each page's own `h1` is the large title. When it scrolls under the bar, the bar swaps the wordmark for the page title. The bar's height never changes, so nothing shifts.
- **Bottom sheet** for Departments, with quick links. **Hardware back closes it** (opening pushes one history entry). Escape and the scrim close it too.
- **Lesson dock** on a course page: "Lesson 5 of 12", previous and next. Swipe the dock sideways to move between lessons. It leaves when you are above the first lesson or below the last.
- Safe areas are respected on the bar, the tab bar, the dock and the sheet.

Narrow screens get their own information architecture: My path is in the centre of the tab bar, the dashboard sections become a chip row, and courses in hand become a swipe shelf.

## 6. Progress: "My path"

Route: `/dashboard` (the study studio moved to `/dashboard/studio`; every other dashboard route is unchanged). Component: `components/MyPath.astro`. Rules: `lib/path.ts`, pure and unit-tested in `test/my-path.test.ts`.

| Part | Rule |
| --- | --- |
| **Next best step** | One suggestion, one button: resume the course in hand, else take the test that is ready, else the next course in the same subject, else begin with the foundations. |
| **This week** | The learner sets a goal of 1 to 7 days. A day counts when the activity grid records 60 seconds. Monday to Sunday. |
| **Rhythm** | A humane streak: one day off in any seven is a rest day and keeps the rhythm. Today never counts as missed while it is still today. |
| **Subjects** | One ring per subject begun: lessons done out of the lessons in the courses started. |
| **Continue** | Every course begun, last opened first, each a deep link to the next lesson or the test. |
| **Milestones** | Ten, from the first lesson to one hundred active days. Reached ones first, then the nearest three. |
| **Recent learning** | Lessons marked complete, by day, with the minutes the activity grid holds for that day. |

**Words.** The copy encourages and never counts what was lost. A test asserts no message contains "streak", "missed", "lost", "broke", "behind", "fail", "only" or "don't". No leaderboards, no countdowns, no notifications asking a child to come back.

**Progress elsewhere.** Catalogue rows the learner has begun show a status chip and a thin bar. The course outline ticks each finished lesson. The home page shows a "continue" card with a ring when this device holds a course in hand (this also fixes the old card, which read unprefixed storage keys and so never appeared).

### Data: what exists and is used

| Source | Used for |
| --- | --- |
| `/data/index.json` | Course titles, subjects, lesson counts |
| `localStorage` `su_v1_done_<id>`, `su_v1_passed_<id>`, `su_v1_last_course`, `su_v1_activity` (written by the course page today) | Progress on this device, signed in or not |
| `GET /api/progress` (signed in) | Server record, merged over the device record |
| `GET /api/activity/stats` (signed in) | The year's activity grid for rhythm, week and minutes |
| `localStorage` `su_v1_path_goal`, `su_v1_path_seen`, `su_v1_path_log` (new, device only) | The weekly goal, which milestones have been seen, and a log of lessons marked complete from now on |

No endpoint was added or changed, and no database was touched.

### Proposal: backend changes that would complete the model (not built)

1. **Weekly goal with the account.** `GET /api/me` to return `weeklyGoal` (1 to 7); `POST /api/me` to accept it. One nullable integer column on the user row. Until then the goal is kept per device.
2. **A real timeline.** `progress` stores one `updated_at` per course, so the server cannot say when each lesson was done. Either a `lesson_events(user_id, course_id, lesson_id, completed_at)` table written by the existing single-lesson `POST /api/progress`, or a `done_at` map beside `done`. Then `GET /api/progress?events=30` returns the last 30 days. Until then the timeline uses the device log, which starts empty.
3. **Family progress.** One read endpoint per site returning a small summary (`{ site, rhythmDays, weekDone, weekGoal, nextStep: { title, href } }`) to a signed-in user, called by the sikhi.io hub with the existing SSO token (sikhi.io `.cc/plan-sso-receiver-punjabiuni-sikhiuni.md`). For this site: `GET /api/path/summary`, built from `progress` and `daily_activity`. The hub stays the only token issuer.
4. **Rest days on the server.** `GET /api/activity/stats` returns a strict streak. The page computes the humane rhythm from the grid it already returns; moving the rule server-side would let emails and certificates quote the same number.

## 7. Motion

Spring curve `cubic-bezier(0.22, 1, 0.36, 1)`, 160 to 380 ms, plain transitions so every move can be interrupted. Transform and opacity only, so layout never shifts. `prefers-reduced-motion` gets short fades: light fields stop, cards do not lift, the celebration does not play. `prefers-reduced-transparency` and the site's own high-contrast mode (`body.hc`) turn every glass surface solid.

## 8. Accessibility

- **Contrast:** `test/contrast-liquid.mjs` is a build gate. It reads the tokens from `liquid.css` and checks 97 text and glass pairs at 4.5:1 in both themes, including the shell glass over the darkest and lightest grounds on the site.
- **Targets:** 44 px minimum on buttons, tabs, rail items, sheet rows and the goal stepper.
- **Focus:** a 2 px ring on every interactive element, gold on navy grounds.
- **Semantics:** rings carry `role="img"` and a text label; bars are `role="progressbar"`; the goal stepper is a labelled group with a live output; the sheet is a modal dialog that returns focus.
- **No JavaScript:** navigation, the catalogue and course outlines read as before. My path needs JavaScript to read the device record and says so.

## 9. Gates run on this branch

| Gate | Result |
| --- | --- |
| `npm test` (vitest, repo root) | 66 files, 1,007 tests pass, including 14 new in `test/my-path.test.ts` |
| `npm run build` (in `web/`): data sync, Gurbani verification, i18n check, institute validation, Astro build, CSP, course-content and no-reveal gates | Pass, 1,319 pages |
| `test/contrast-glass.mjs` (existing) | Pass, 32 pairs |
| `test/contrast-liquid.mjs` (new, wired into the build) | Pass, 97 pairs |
| `scripts/check-no-emoji.mjs` | Pass |

One existing test was updated on purpose: `test/dashboard-restoration.test.ts` pinned `/dashboard` to the study studio. It now pins `/dashboard` to My path and checks the studio's own route.

## 10. Not done, and known limits

- **Not seen on a real phone.** Screenshots are headless Chromium at 1440 by 900 and 390 by 844. Blur cost, the sheet's back gesture and the dock swipe need a real iOS and Android pass.
- **Signed-in state not exercised.** The local Worker has no seeded account, so the merge of `/api/progress` and `/api/activity/stats` is covered by reading the handlers and by the unit tests, not by a logged-in screenshot.
- **Pages not yet lifted:** departments, professors, programmes, Santhya, the Institute of Technology, auth and admin pages keep their ledger skin inside the new shell. The Institute pages keep their own fonts and palette on purpose.
- **Translations:** new My path copy is English in the markup. Dashboard pages are not machine-translated today; adding keys means all eight dictionaries in one commit (`DESIGN.md` house rule).
- **Fixed helpers:** the Donate pill and the accessibility button still float over content on narrow screens. They are hidden on course pages while the lesson dock is showing.
- **Dark theme:** the dashboard's older dark rules for its section rail still apply and differ slightly from the light rail.
