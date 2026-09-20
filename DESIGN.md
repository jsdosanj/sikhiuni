# Sikhi University — Design System 3.0 (registrar's ledger)

The contract for every visual change. It exists so that many editing passes (human or
agent) stay coherent instead of drifting back to emoji, stock blues, and template layouts.
Precedence: the user's explicit direction → this file → individual taste.

The system is a flat "registrar's ledger": warm paper surfaces, hairline rules, 2px navy
section rules, 3px radii, mono micro-labels, navy header bands, and midnight dark heroes.
Archivo carries all Latin type; IBM Plex Mono carries every label and datum. The former
glass/cinematic language is demoted to nav chrome (see *Surface language* below).

## Principles (ranked — cite these when a call is close)

1. **Reverence over flourish.** The product's feeling is reverence, trust, and generosity.
   Motion and glass exist to make learning feel precious — never to show off. When a
   flourish competes with content, the flourish loses.
2. **Gurmukhi is first-class, never a fallback.** Sacred script is self-hosted and set with
   care, never left to whatever font a device happens to have.
3. **Content is never gated on JavaScript or motion.** A production incident hid entire
   course pages because content sections were reveal-gated and the observer never fired.
   Law: lesson prose, quiz, santhiya text, and any primary content must be fully readable
   in raw HTML with JS disabled. Reveal/stagger is for decorative grids only.
4. **Trust is earned, not claimed.** Verification and review-status copy must never overclaim.

## Type — locked

Fonts are self-hosted in `web/public/fonts/` (`fonts.css`, inlined into `Base.astro`'s
head). No CDN font links (the CSP forbids external font hosts).

| Role | Family | Notes |
|------|--------|-------|
| Shabad / verse | **Noto Serif Gurmukhi** | `.shabad` and `blockquote.gurbani`; generous leading |
| Gurmukhi UI / labels | **Noto Sans Gurmukhi** | `font-gur` / `.gur` |
| Urdu UI | **Noto Nastaliq Urdu** | auto via `html[lang="ur"]`; loose leading |
| Display + headings + Latin body | **Archivo** (Georgia fallback) | `font-sans` (body + `h1–h4`) and `font-display`; self-hosted variable woff2 |
| Micro-labels, eyebrows, data, chips, breadcrumbs, credential ids | **IBM Plex Mono** | `font-mono`; `.eyebrow`, `.chip-status`, `.stat-mono`, table headers, nav links |

**Archivo specifics** (set at the source in `global.css`, task 2): body and `h1–h4` are
`font-sans` (Archivo); `.text-display` / `.text-display-sm` are Archivo **700**,
`letter-spacing: -0.034em`, sentence case, with the `:not(.gur)` guard so bilingual titles
(e.g. Santhya's `ਸੰਥਿਆ` span combining `.text-display` with `.gur`) fall through to Noto
Serif Gurmukhi. Clamp sizes are unchanged: `.text-display` `clamp(2.6rem,1.6rem+4vw,4.25rem)`,
`.text-display-sm` `clamp(2.2rem,1.6rem+3.2vw,3.6rem)`.

**IBM Plex Mono specifics:** `.eyebrow` is mono, 11px, weight 500, uppercase,
`letter-spacing: 0.18em`. Nav links (`html:lang(en) .su-nav-link`) are mono uppercase
`.14em`. Mono ships latin + latin-ext subsets only — non-Latin UI languages (nav labels are
`data-i18n`-translated at runtime) fall through to their own scripts' faces rather than tofu.

**Source Serif 4** — retained on disk (woff2s + `@font-face` blocks kept, and it remains the
`serif` stack for rollback/any content that names it) but has **no default role**; body and
headings are Archivo, not serif.

**Vintage College Dept — RETIRED, and fully removed (task 21).** It was the former
collegiate display/wordmark face and was shipping in production as a **demo-license** font
(fontspace.com/vintage-college-dept-font, uppercase glyphs only). Archivo replaced its role in
task 2 (`.text-display`, `.su-nav-link`). The `@font-face` block and the `.ttf` file are gone.

Display scale: `.text-display` / `.text-display-sm` / `.eyebrow` are the only sanctioned
sizes above `text-4xl`. `.gur` bumps to `1.12em` / 1.9 leading; every Gurmukhi run carries
`lang="pa"`. No raw `text-[Nrem]` literals outside the scale.

## Color — locked tokens + banned list

Tokens live in `web/src/styles/global.css` (`--c-*`, light + dark) and are surfaced as
Tailwind utilities in `tailwind.config.mjs`. Navy + gold on warm paper. Gold
(`--c-saffron-deep` for text on light) is the sole accent.

Locked `--c-*` tokens (light): `--c-paper` `251 248 241`, `--c-surface` `255 254 251`,
`--c-ink` `16 19 26`, `--c-muted` `91 100 115`, `--c-line` `228 232 240`, `--c-navy`
`22 51 92`, `--c-saffron-soft` `253 238 200`, `--c-saffron-deep` `120 82 5` (each has a
dark-theme counterpart). Every one is variable-driven so the whole site flips light ↔ dark.

**Three fixed additions from task 2 (theme-invariant, not variable-driven):**

| Token | Value | Use |
|---|---|---|
| `midnight` | `#0A1729` | fixed dark-hero field (`.hero-midnight`, auth surfaces) — stays #0A1729 in both themes, like `brand` |
| `danger` | `#9A3B2A` | editorial rust for review/studio/admin **failure** states (was `#c0392b`) |
| `danger-soft` | `#FFF4F2` | rust tint panel background |

Rule, carried forward: **map prototype/design hexes to their existing tokens; never fork a
parallel palette.** A literal hex or a shadow palette breaks the dark theme and the
locked-token law. Program-level tints (`#5c3b8a`, `#8a5a14`) stay page-local constants in
programs/paths only — not worth tokens.

**Do not use:** the generic product-blue (`#1f6feb`) as an accent; pure `#fff` paper; any
color not derived from the tokens.

## Surface language — flat registrar's ledger

The primary surface story is **flat warm paper**, not glass. Default surfaces are `bg-surface`
/ `bg-paper` with 1px `line` hairlines and the sharp 3px radius (`rounded-xl2`, the single
global radius lever). The prototype uses **zero** `backdrop-filter`; so does every redesigned
page. The component vocabulary (all defined in `global.css` `@layer components`, all colours
from token utilities so dark mode keeps working):

| Class | Use |
|---|---|
| `.rule-navy` | Section-head underline — a 2px navy rule under a heading row (`border-b-2 border-navy`). |
| `.row-ruled` | One ruled ledger row (`flex flex-wrap items-baseline … py-3 border-b border-line`) — the default for list-like/tabular data. |
| `.chip-status` | Status chip — mono 10px, `.1em`, 2px radius; **the caller sets the colour** via token utilities (see vocabulary below). |
| `.band-navy` | Navy page-header band (`bg-brand text-white`) — breadcrumb + title on a dark field, fixed navy in both themes. |
| `.hero-midnight` | Dark editorial hero (`bg-midnight text-paper`) with a **single** gold radial glow — a decorative `::before` (`radial-gradient(closest-side, rgba(244,178,26,.13), transparent 70%)`, off-canvas top-left; no aria markup needed). |
| `.stat-mono` | Stat block — mono 27px navy numeral + 10px uppercase muted label (exactly two children). |
| `.btn` | Flat, 2px radius, uppercase 11.5px bold `.16em` label; navy outline on light. `.btn-primary` = gold on `midnight`; `.btn-ghost` = white outline on dark. |
| `.eyebrow` | Mono 11px uppercase `.18em` label (see Type). |

**Status-chip vocabulary** — the four sanctioned status colours (set by the caller on
`.chip-status`):

| State (examples) | Colour utilities | Token meaning |
|---|---|---|
| `REVIEWED` | `text-ok border-ok` | green (`#2f7d4f`) — verified/passed |
| `IN REVIEW` | `text-saffron-deep border-saffron-deep` | gold — in progress / pending |
| `DRAFT` | `text-muted border-muted` | muted — neutral / not started |
| `BLOCKED` / `FAIL` | `text-danger border-danger` | rust (`#9A3B2A`) — failure / blocked |

`blockquote.gurbani` uses the ledger treatment too: a flat 3px saffron rule on the leading
edge, `bg-saffron-soft` panel, radius 0 — never a glass card.

**Glass is demoted, not deleted — legacy chrome, `.su-nav` only.** The only remaining live
`backdrop-filter` is the frosted primary nav (`.su-nav`, one blur), so the blur budget is now
trivially met. The glass classes (`.glass`, `.glass-strong`, `.glass-lite`, `.glass-card`)
and glass tokens (`--glass-*`) **remain defined in `global.css` specifically so
`test/contrast-glass.mjs` keeps passing** — that gate parses the glass/ambient/token CSS
structure and hard-fails if the markers are missing. **Do not add any new glass surface.** As
pages are redesigned they replace glass panels with the flat surfaces above; the nav's frost
stays as load-bearing chrome. `body.hc` (high-contrast) still forces every glass surface solid
black — never bypass it.

## Ambient backgrounds — one layer per page

`Base.astro` takes `ambient: 'hall' | 'study' | 'sanctum' | 'none'` and renders a single
fixed, `aria-hidden`, `z-index:-1` layer (a fixed *element*, not `background-attachment` —
iOS). Sections stop owning their own full-bleed gradients; content sits over the ambient.
`bgImage` oil paintings are dropped from redesigned pages (the prop stays supported).

| Ambient | Character |
|---|---|
| `hall` | grand navy, two slow-drifting radial glows |
| `study` | warm paper, static saffron top glow |
| `sanctum` | deep navy→ink, 90s "diya" glow pulse |
| `none` | no fixed layer (flat paper) — workbench + legal/policy pages |

Ambient animation is transform/opacity keyframes only and is frozen by the global
reduced-motion kill-switch.

**Page → ambient (from the redesign SCREENS table — all 33 designable pages):**

| Page | Ambient |
|---|---|
| `index.astro` | hall |
| `about.astro` | hall |
| `login.astro` | hall |
| `404.astro` | hall |
| `teachers.astro` | hall |
| `mfa.astro` | hall |
| `paths.astro` | hall |
| `reset-password.astro` | hall |
| `external.astro` | hall |
| `catalog.astro` | study |
| `search.astro` | study |
| `professors.astro` | study |
| `professor/[slug].astro` | study |
| `teacher-shell.astro` | study |
| `course/[id].astro` | study |
| `dashboard.astro` | study |
| `programs.astro` | study |
| `program/[id].astro` | study |
| `cohorts.astro` | study |
| `cert.astro` | study |
| `verify.astro` | study |
| `open-data.astro` | study |
| `integrity.astro` | study |
| `santhiya.astro` | sanctum |
| `baal-updesh.astro` | sanctum |
| `collection/[name].astro` | sanctum |
| `review.astro` | none |
| `teach.astro` | none |
| `studio.astro` | none |
| `admin.astro` | none |
| `ai-policy.astro` | none |
| `legal.astro` | none |
| `feedback.astro` | none |

(`santhiya.astro` hosts both the pathway and ang-reader views; both are sanctum.
`read.astro` and `muharni.astro` are redirect shells with no visual surface and are not
counted among the 33.)

## Motion vocabulary

Vars: `--ease-out` (enters), `--ease-cinema` (transitions, ring sweeps), `--ease-spring`
(celebration, palette pop); `--dur-press` 150ms, `--dur-hover` 300ms, `--dur-reveal`
600ms, `--dur-grand` 1200ms; ambients 40–90s.

| Move | Spec | Never on |
|---|---|---|
| enter | `.reveal` fade+rise 16px, IO **threshold 0** (law — see Principle 3) | lesson/quiz/santhiya content |
| stagger | `data-reveal-delay`, 90ms steps | more than 6 siblings |
| tilt-3d | `[data-tilt]`, ≤6°, `(pointer:fine)` only, rAF, will-change scoped to hover | touch devices, content blocks |
| parallax | `data-parallax="0.15/0.3"` hero layers, desktop only, translate3d | body content, mobile |
| page transitions | CSS-only MPA `@view-transition` cross-fade 250ms; Safari falls back to `su-page-enter` (auto-disabled where VT is supported) | — |
| progress ring | SVG `data-ring-pct` dashoffset sweep 900ms; the value is ALWAYS also text | rings without a text value |
| celebration | drawn seal stamp-in (`--ease-spring`) + one glow pulse + toast | confetti, emoji, sound |

All motion is behind `prefers-reduced-motion` (global kill-switch + JS `reduced()` gates);
reduced users get final states instantly.

## Layout — the grid law

**List-like / tabular data (catalog, cohorts, programs, rosters, queues) renders as ruled
full-width rows** (`.row-ruled` under a `.rule-navy` section head), not a card grid — this is
the signature of the ledger system and replaces the old "4+ items = 2-column grid" default.

**Card grids WITH real imagery** (visual cards carrying a portrait/thumbnail) keep the
**2-column-at-`sm+`** rule (2×2, 2×3…).

Lesson text and long-form reading are always full-width (max measure `68ch`) and never inside
grids.

## Iconography — law

One line-icon set (`web/src/lib/icons.ts`), `currentColor`, consistent stroke. **Emoji are
banned as UI glyphs** (CI grep guard). The verification mark is the drawn seal
(`sealMark()` in `icons.ts`); as shipped it's used on the certificate and the verify
page. Course-pill/catalog-card "verified" indicators currently use a plain
`.chip-status` pill instead (`course/[id].astro`) — a real, disclosed gap, not an
implementation of this canon's original intent. Wiring those two surfaces onto
`sealMark()` (or narrowing this line further if that turns out not to be the right
call) is open follow-up work, not silently done.

## Component canon

Ledger primitives (`.rule-navy`, `.row-ruled`, `.chip-status`, `.band-navy`, `.hero-midnight`,
`.stat-mono`, `.btn`/`.btn-primary`/`.btn-ghost`, `.eyebrow`, `.card`/`.card-lift`), pill/badge,
`ReviewStatus`, `VerifiedMark` seal, command palette, progress ring, state kit (skeleton /
empty / error / 404), ambient layer, certificate (solid surface, never blurred — html2canvas
cannot rasterize blur). Glass Modal/Toast + the frosted nav remain as legacy chrome only (see
*Surface language*).

## Reverence rules for sacred content

Gurbani is never smaller than surrounding Latin; never rendered in a Latin-only fallback;
always `lang="pa"`; never truncated, paraphrased, or machine-generated — display text comes
only from the verified local corpus (`verify-gurbani.mjs` gates the build). The daily
shabad renders a full tuk verbatim with its ਅੰਗ citation and a link into the reader.

## Per-change acceptance checklist

- [ ] Content readable with JS disabled (course pages especially)
- [ ] No new glass surface added; the only live `backdrop-filter` is the nav
- [ ] WCAG 2.2 AA on the changed flow — including text on `band-navy` / `hero-midnight` / paper, and on the retained glass nav over the darkest ambient stop
- [ ] Reduced-motion pass: ambients static, reveals instant, rings show final value
- [ ] `body.hc` forces solid surfaces on any retained glass chrome
- [ ] No emoji as UI glyphs; no `prompt(`/`alert(`; fonts self-hosted; CSP untouched
- [ ] Any Gurmukhi run carries `lang="pa"` and a real Gurmukhi face
- [ ] No raw `text-[…rem]` literal outside the type scale; hexes are tokens only
- [ ] List-like data uses ruled rows; image-card grids use 2-col-at-`sm+`; reading stays full-width ≤68ch
- [ ] Protected JS hooks preserved (page scripts query IDs/classes — enumerate before re-skinning)
- [ ] **i18n house rule:** any new/changed `data-i18n` key lands in **all 8** language dictionaries (`web/public/assets/i18n/{ar,de,es,fr,hi,pa,ur,zh}.json`) in the **same commit** — `check-i18n` is a hard build gate; English lives in the markup as fallback
