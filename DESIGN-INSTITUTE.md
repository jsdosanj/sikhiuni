# Design System — Institute of Technology

**Sub-brand of Sikhi University. v1.0 · 2026-08-28 · D1–D10 locked.**
Preview: https://claude.ai/code/artifact/b52a803e-097a-4aaf-851f-b3a64784a149

This is a **companion** to the root `DESIGN.md`, not a replacement. The main design
system governs sikhiuni.com. This governs the `/technology/*` wing only. Where this file
is silent, `DESIGN.md` applies (a11y gates, the verification seal spine, self-hosted
fonts, no-emoji-as-chrome, `prefers-reduced-motion`, the certificate verification model).

Precedence: the user's explicit direction → root `DESIGN.md` non-negotiables → this file
→ individual taste.

---

## Product context

- **What it is:** Sikhi University's engineering wing — software and AI engineering courses
  (AI Engineering from Scratch curriculum + our own sikhi.io coding courses), with an
  in-browser code lab and a terminal that teaches by typing itself out.
- **Who it's for:** Sikhi University students who also want to learn to build software and
  AI systems, from first-timers to working engineers.
- **The one thing to remember:** *you walked through a threshold into a different building —
  the engineering lab, lit at night — and the university's gold thread came with you.*
- **Project type:** hybrid — an app (the lab, the catalog, the dashboard) with editorial
  moments (the threshold entry, the booth hall).
- **Reference points:** sikhi.io `/code` dojo (the ground + mono we blend to),
  aiengineeringfromscratch.com (light technical-manual source aesthetic), boot.dev (dark
  learning platform), freeCodeCamp `/learn` (the split editor/preview/console the lab owes to).

## Aesthetic direction

- **Direction:** Retro-futurist / industrial — "the engineering building after dark."
- **Decoration level:** intentional — a faint bench-grid texture, hairline-ruled instrument
  panels, monospace corner-labels. No blobs, no gradients-as-decoration, no glow spam.
- **Mood:** exact, quiet, focused. A real lab at 2 a.m., not a sci-fi bridge. The main
  campus is a sunlit library; this is the lab across the courtyard. Same institution.
- **The blend:** shared global nav + footer; lesson prose stays in the university's serif;
  the gold accent is the university's saffron carried inside; the certificate uses the same
  verification spine and seal. The **departure**: a dark-primary theme (light theme also
  ships), monospace signage, the IDE/terminal motif, typing as the signature motion.

## Typography — LOCKED

- **Display — Chakra Petch (D1: Option B).** The one display face: wordmark, `h1`/`h2`,
  catalog headings, the certificate heading. Angular, engineered, versatile. Weights 500/600/700.
  No dot-matrix face anywhere — dropped for a cleaner single-display system.
- **UI / labels / data / signage — JetBrains Mono.** Already in the sikhi.io dojo. `tabular-nums`
  on. Uppercase labels at `letter-spacing: .18–.22em`. Phase numbers render here (tabular mono),
  not a bitmap face.
- **Code — JetBrains Mono.** Syntax palette in §Color.
- **Lesson prose — Source Serif 4 (D4).** Matches the main university's lesson body — a lesson
  still feels like class.
- **Gurmukhi — Noto Serif Gurmukhi / Noto Sans Gurmukhi.** Unchanged, first-class, every run
  carries `lang="pa"`. ੴ is content, never chrome.
- **Loading:** self-hosted in `web/public/fonts/` via the existing `fonts.css` pipeline. No CDN
  font links (CSP). Add: Chakra Petch, JetBrains Mono, Source Serif 4 (if not already present).
- **Scale (px):** wordmark clamp(28, 5.5vw, 52) · h2 clamp(21, 3vw, 28) · lesson body 17/1.65 ·
  UI 13 · label 11 · code 13–14. No raw `text-[…rem]` literals.

## Color — LOCKED

**Theme-aware, both light and dark at launch (D3 + D7).** Dark is the primary voice (the lab
at night); light is "lights on" for glare/low-vision/preference. Define the full **dark** palette
on bare `:root`; redefine tokens under `@media (prefers-color-scheme: light)` guarded
`:root:not([data-theme="dark"])`, and again under `:root[data-theme="light"]` so the manual
toggle wins both ways. Style components through tokens only. `body` sets an explicit token
background. The site's existing `su_v1_theme` key drives the toggle; IoT reads it.

| Token | Dark | Light | Role |
|---|---|---|---|
| `--ground` | `#090D18` | `#F4F2EC` | page floor |
| `--surface` | `#111826` | `#FFFFFF` | panels, benches |
| `--surface-2` | `#0C121E` | `#EEEBE2` | editor, recessed |
| `--line` | `#253049` | `#D8D3C6` | hairline rules |
| `--line-soft` | `#1A2236` | `#E6E2D6` | the bench-grid |
| `--ink` | `#E8E5DB` | `#1C2333` | body text |
| `--ink-dim` | `#A7AFC2` | `#4A5468` | secondary text |
| `--muted` | `#79839A` | `#6B7488` | labels (AA verified both themes) |
| `--filament` | `#E6A93C` | `#B27A16` | the gold thread — wordmark, active state, primary button, cert seal |
| `--signal` | `#58E0C8` | `#0E9C86` | **D2** — *live / running / correct* ONLY. Never decorative. |
| `--fail` | `#E96A70` | `#C0343B` | test/check failure only |
| `--plum` | `#B48AE0` | `#7C3FB0` | rare — 500-level marker + syntax keyword |

- **Approach:** restrained — one accent (`--filament`), one signal (`--signal`), the rest neutral.
- **Semantic:** success = `--signal`, warning = `--filament` + a triangle glyph (never colour
  alone), critical = `--fail`.
- **The bench-grid texture** (`--line-soft` grid): ≤ 0.3 opacity, top-masked, never behind
  reading-length text. In light theme drop to ≤ 0.18.

## Spacing

- **Base unit:** 4px. **Density:** comfortable in prose, compact in the lab/console.
- **Scale:** 2xs 2 · xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48 · 3xl 64.
- Sibling groups laid out with flex/grid + `gap`, never per-element margins.

## Layout

- **Approach:** grid-disciplined for the app (catalog, lab, dashboard); editorial for the
  threshold entry and the booth hall.
- **Max content width:** 1080px; lesson prose column ~68ch.
- **Motif:** instrument panels — hairline-ruled rectangles, each with a monospace corner-label
  (`F14.01 · AGENT ENGINEERING`) and a full box (no colored left-border — hard rule). A
  persistent 44px top rail: crest + wordmark left, quiet "← Sikhi University" return right.
- **Border radius:** sm 3px · md 5px · lg 6px. Tighter than the main site — machined, not soft.
- **Code Lab < ~760px (D5: Option B):** vertical stack — the editor stays visible at the top;
  Preview and Console are collapsible sections beneath it (Console open by default after a
  Run); check results as a bar directly under the editor; "Run" is a bottom-fixed button.
  Editor stays real (CodeMirror mobile), never read-only.
- **Terminal dojo < ~760px:** file-tree → `▸ files` disclosure; editor + terminal stack;
  status bar drops to two fields; auto-play demo still runs.

## Motion

- **Approach:** intentional. The signature is **typing / assembly** — text and code that
  write themselves (the dojo already does this; the lab console echoes it).
- **The threshold (D6):** entering `/technology` plays a one-time "power-on" — a `--signal`
  sweep line + a typed wordmark, ~2.4s. **Once per session** (`sessionStorage` flag); never
  on internal navigation within `/technology/*`.
- **Micro:** hover lifts on cards (2px), a scanline whisper on terminal surfaces, caret blink.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duration:** micro 60–100ms · short 150–250ms · medium 250–400ms · threshold 2400ms.
- **`prefers-reduced-motion`:** all typing resolves instantly to final text; the power-on
  sweep and caret are suppressed; no scanline.

## The college-fair booths (`/technology/explore`)

The hall is this system. Each booth is a self-contained region that **deliberately breaks**
it to mimic its source — palette + type cues only, **no logos, no scraped screenshots**,
plus an honest "not affiliated" line and an outbound `rel="noopener"` link.

| Booth | Ground | Accent | Type cue |
|---|---|---|---|
| freeCodeCamp | `#0a0a23` | `#02be8c` green, `#99c9ff` | system sans / Lato feel, `{ }` motif |
| Class Central | `#ffffff` | `#5f37be` purple, `#e64b5f` | Helvetica/Arial, card grid |
| Libre.academy | `#0c0b0a` | `#e0734d` burnt orange | monospace, halftone dot texture |

## Certificate (D10)

Distinct *face* from the main university's reverent certificate, **same seal and same trust
model**. Dark card, `--filament` inner rule. **"SIKHI UNIVERSITY"** and the program name in
Chakra Petch, **"INSTITUTE OF TECHNOLOGY"** in spaced JetBrains Mono beneath. The mark in the
seal position is the **exact same drawn five-surface verification seal** as `cert.astro` /
`/verify` (D10) — one seal, one trust mark, rendered pixel-identical, just on a dark ground.
Same signing + `/verify` spine. Light-theme cert uses the light token set.

## Non-negotiables carried from `DESIGN.md`

- WCAG 2.2 AA on every changed flow.
- No emoji as UI glyphs — one drawn line-icon set in the Institute's voice. (Terminal glyphs
  `❯ ✓ ✗` allowed *inside terminal/console surfaces only*.)
- Fonts self-hosted; CSP has no external font/script host.
- The verification seal renders pixel-identical across surfaces — IoT reuses it, does not redraw it.
- Every Gurmukhi run: real Gurmukhi face + `lang="pa"`, never smaller than adjacent Latin.

## Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-08-28 | Sub-brand design system drafted | `/design-consultation`; researched sikhiuni, sikhi.io dojo, AISF site, boot.dev. Retro-futurist "engineering building at night", gold thread retained, serif lesson prose retained for the blend. |
| 2026-08-28 | `/plan-design-review` run against `WORLD-CLASS-IOT-PLAN.md` | Score 4.5→7.5. Added the 6 hard AI-slop rules. Surfaced D5–D10. |
| 2026-09-09 | Two sub-schools (AI, Cybersecurity) share the one accent | D2 reserves `--signal` for live/correct states and the system allows one accent, so the schools are distinguished by a monospace mark (`[ai]`, `[sec]`) and a `//` label rather than a second colour. Two new booths (SANS, NICCS · CISA) follow the existing college-fair rule — palette + type cues, no logos, AA verified. |
| 2026-08-28 | **D1–D10 LOCKED by founder** | D1 Chakra Petch (Option B), no dot-matrix. D2 keep `--signal` cyan. D3+D7 theme-aware light+dark at launch. D4 Source Serif 4 prose. D5 mobile lab = collapsible vertical stack. D6 power-on once per session. D8 Rust/Julia read-only + local. D9 atlas keeps sikhi.io model + search-first. D10 same drawn seal, dark card. |
