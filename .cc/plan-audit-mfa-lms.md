# Plan: audit logging, optional MFA, and Moodle/Canvas-class LMS features

Status: **proposal, not started.** Written 2026-11-11 against `master` @ `1422996`.
Each workstream ships as its own PR. Every D1 schema change is shown as a reversible
migration and approved before it runs (standing rule from the degree-claims work).

---

## Part A. Audit logging

### What exists today (verified in code)

- One append-only table, `events (id, ts, user_id, role, action, target, detail)`, with an
  index on `ts` (`schema.sql:264`). Written by `logEvent()` in `functions/api/_lib.js:57`,
  called from 51 files with about 65 distinct actions (login, role_change, grade_override,
  mfa_*, studio_*, certificate_issued, account_merge, …).
- Admin viewer: `GET /api/admin/events` (filters: action, role, text, date range; paging)
  and the **Audit** tab in `admin.astro`.
- Account deletion and account merge deliberately leave `events` alone (good).

### Gaps

| # | Gap | Why it matters |
|---|-----|----------------|
| A1 | No request context: no IP, country, user agent, session, or `cf-ray` | Can't tell a real login from a stolen-cookie one, or trace an incident to a request |
| A2 | Failures aren't logged: failed logins, failed MFA codes, failed reset codes, 401/403 on admin routes, rate-limit trips | The events you most need in an incident are missing |
| A3 | Sensitive **reads** aren't logged: gradebook CSV, drafts export, archive-requests export, account export, admin user list | Data leaving the system leaves no trace |
| A4 | Unstructured: `target`/`detail` are free text (`"course/user"`, `"score=90"`, `"learner→admin"`) | Hard to filter by affected user; no before/after values |
| A5 | `logEvent` swallows every error silently | If the table breaks, auditing stops and nobody knows |
| A6 | No retention policy; no tamper evidence | The table grows forever; a DB-level edit is undetectable |
| A7 | No export, no per-user timeline, no alerts | Admins can't hand an auditor a file or get told about risky changes |
| A8 | Users can't see their own security activity | No "was this you?" moment after a suspicious login |
| A9 | `q` filter puts user input into `LIKE` without escaping `%`/`_` | Minor: wrong matches, no injection risk (values are bound) |

### Design

1. **Migration `0017_audit_context.sql`** (reversible: new nullable columns; rollback
   ignores them, or drops them on SQLite ≥ 3.35):
   `ALTER TABLE events ADD COLUMN ip TEXT, country TEXT, ua TEXT, session_hash TEXT,
   ray TEXT, subject_user_id TEXT, target_type TEXT, outcome TEXT, prev_hash TEXT, hash TEXT`
   plus indexes on `(user_id, ts)`, `(subject_user_id, ts)`, `(action, ts)`.
2. **`logEvent(env, user, action, target, detail, ctx?)`**: an optional 6th argument
   `{ request, subject, targetType, outcome: 'ok'|'fail'|'denied', before, after }`, so the
   51 existing call sites keep working and get upgraded file by file. Context comes from
   `CF-Connecting-IP`, `request.cf.country`, `User-Agent` (truncated to 200), `cf-ray`, and a
   SHA-256 of the session id (never the raw id). `detail` stays as text; `before`/`after`
   are stored as JSON in it.
3. **New events (A2, A3):** `login_failed` (with a reason code, never the password),
   `mfa_failed`, `reset_code_failed`, `register_completed`, `password_changed`,
   `authz_denied` (from `requireRole`/`requireMfa` on `/api/admin/*`), `rate_limited`
   (from the worker limiter), and `export_*` for each CSV/JSON export and the account
   export.
4. **Reliability (A5):** on failure, `console.error("audit_write_failed", action)` so it
   shows in Workers logs. Security events stay awaited; high-volume learning events
   (`lesson_completed`, `quiz_attempted`) move to `waitUntil`.
5. **Tamper evidence (A6):** a hash chain, `hash = SHA-256(prev_hash || canonical(row))`,
   plus a nightly cron that verifies the last N rows and logs `audit_chain_broken` if it
   fails. This is honest about its limits: it detects edits, it doesn't prevent them. D1
   Time Travel is the recovery path.
6. **Retention (A6), in the existing `pruneExpired` cron:** keep security and admin events
   for 2 years; delete learning-progress events after 180 days; set `ip`/`ua` to NULL after
   90 days (privacy minimisation). Document all of this in `docs/SECURITY.md` and the
   privacy policy.
7. **Admin UI (A7):**
   - Audit tab: "Failures only" and "Security" presets, filter by subject user, a CSV
     export (itself logged), and IP/country columns.
   - Users tab: a per-user activity timeline.
8. **Alerts (A7):** email akaal@sikhi.io (Resend, existing pattern) on: a role change to
   admin, an MFA reset, an account merge, ≥10 failed logins for one account in 15 min,
   and a broken audit chain. At most one email per action per hour.
9. **User-facing (A8):** "Recent account activity" on the dashboard profile (last 20
   sign-ins, MFA/password changes, with device, country and approximate time), plus a
   "Sign out everywhere" button (deletes the user's sessions; logged).
10. **Fix A9:** escape `%`/`_` and add `ESCAPE '\'`.

**Tests:** a context-capture unit test; a failed-login event test; an `authz_denied`
test on an admin route; a hash-chain verification test (real SQLite, like
`program-rows.test.ts`); a retention-prune test; an assertion that no password, code or
raw session id ever appears in `detail`.

---

## Part B. Make MFA optional for learners, teachers and admins

### What exists today

- **Sign-in:** nobody is forced to enrol. If you **are** enrolled, every new session must
  pass `/mfa` (`login.js:46-52`, `sso.js`, `reset-password.js`, `requireMfa`).
- **Admins:** already not forced (`_lib.js:91-104`, 2026-09-10 decision).
- **The one hard requirement:** a teacher must be enrolled to **publish their public
  profile** (`teacher/profile.js:64-66`, error `mfa_enrollment_required_to_publish`). The
  dashboard copy says "Two-factor authentication is required…" (`dashboard.astro:308`).
- **Cross-site:** `familyCredentials.js:30` refuses a family-site password sign-in if that
  account has MFA on the other site (`source_mfa_required`).
- **Self-service:** enrolment lives at `/mfa`, and `POST /api/auth/mfa/disable` exists
  (needs a current code). But learners have no settings card to find either one.

### Plan

1. **Remove the publish requirement:** `teacher/profile.js` no longer blocks
   `requestPublish` without MFA. Keep the `mfaEnrolled` flag in the response so the UI
   can still recommend it.
2. **One "Two-factor authentication" card for every role** (dashboard profile):
   - Status line.
   - Turn on: links to the existing `/mfa` enrolment flow.
   - Turn off: needs a current code (existing endpoint).
   - Regenerate backup codes: **new endpoint**, needs a current code; logged as
     `mfa_backup_regenerated`.
   - Copy says "optional, recommended", stronger for admins and teachers.
3. **Keep the guarantees "optional" must not weaken:**
   - An enrolled user still has to pass `/mfa` on each new session.
   - Disabling still needs a code.
   - Admin "Reset MFA" stays, and is logged with an alert (Part A).
4. **Optional, needs your decision:** "Remember this device for 30 days", via a signed,
   httpOnly device cookie tied to the user. It is less friction for people who keep MFA
   on. Default: **off** unless you want it.
5. **Copy and admin:**
   - Update `docs/SECURITY.md`, the dashboard and `/teach` copy.
   - The admin Users tab shows MFA on/off per user, as information only.
   - Record decision D-002 in `.cc/memory.md` ("MFA optional for all roles; publish no
     longer gated").
6. **`familyCredentials` stays as is.** It protects accounts that *chose* MFA on a
   sibling site, and "optional" doesn't mean overriding a user's own choice.

**Tests:**
- Publish without MFA succeeds.
- An enrolled user is still forced through `/mfa`.
- Backup-code regeneration needs a valid code and invalidates the old codes.
- Disable without a code fails.

**Trade-off, stated plainly:** with MFA optional for admins, a stolen admin session
cookie reaches every `/api/admin/*` route. That is already true today. Part A's alerts
and session audit are the mitigation.

---

## Part C. LMS features from Moodle and Canvas

### What Sikhi University already has

- **Learning:** courses with lessons, server-graded multiple-choice quizzes, course
  certificates with `/verify`, certificate programs with a cumulative exam, enrolments,
  per-lesson progress sync, streaks/daily activity.
- **Teaching:** assignments (text/file, due date, points, late flag, grade + feedback), a
  gradebook with overrides and CSV, threaded discussions with moderation and reports,
  announcements, cohorts with invite codes and rosters, teacher assignment to courses.
- **Authoring:** Studio drafts → validation → review queue → publish; media uploads with
  moderation; teacher public profiles.
- **Learner tools:** notes library, focus timer, ratings, push reminders, a PWA, 9
  languages, accessibility controls.

### Gap list, ranked by value to this platform

Ratings: **Value** (H/M/L) for a free, Sikhi-focused, self-paced school with optional
cohorts; **Effort** S (≤2 days), M (≤1 week), L (>1 week).

| # | Feature (Moodle / Canvas name) | Value | Effort | Notes |
|---|---|---|---|---|
| C1 | **Calendar and To-Do** (Canvas Calendar/To-Do, Moodle Calendar) with an iCal feed | H | M | Aggregates assignment due dates, cohort sessions and announcements. Per-user secret `.ics` URL. |
| C2 | **Richer quizzes** (Moodle Quiz): multi-select, true/false, short answer, matching, ordering, numeric; question banks with random draws; attempt limits; time limits; per-option feedback; review settings | H | L | Extends `draft_quiz`/`QUIZ_KEYS`. Keep server-side grading and the no-oracle rules (`quiz.js`, `program-exam.js`). |
| C3 | **Modules with completion rules / conditional release** (Moodle Restrict access, Canvas Module requirements) | H | M | "Unlock lesson 4 after the quiz ≥ 80%". Must stay **optional** per course: open access is a core value. |
| C4 | **SpeedGrader-style grading + rubrics** (Canvas SpeedGrader/Rubrics, Moodle Advanced grading) | H | M | Side-by-side submission and grade panel, rubric criteria, a reusable comment library, next/previous student. |
| C5 | **Notification centre and preferences** (Canvas Notification Settings, Moodle Notifications) | H | M | In-app inbox plus per-event email/push choice (graded, new announcement, reply, due soon). Daily digest option. |
| C6 | **Real teacher analytics** (Canvas New Analytics, Moodle Reports) | M | M | Replaces the "Demo preview" in `dashboard.astro`: engagement, at-risk learners, quiz item difficulty. |
| C7 | **Extensions, late policy, accommodations** (Canvas Assign To/Late Policies, Moodle overrides) | M | S | Per-student due-date overrides, extra quiz time, late-deduction rules. |
| C8 | **Groups within cohorts + group assignments** (Moodle Groups, Canvas Groups) | M | M | One submission per group, group discussions. |
| C9 | **Peer review** (Canvas Peer Reviews, Moodle Workshop) | M | M | Anonymous peer feedback with a rubric. Fits reflective Sikhi study. |
| C10 | **Reflective journal** (Moodle Journal) | M | S | A private learner journal per course, teacher-visible only with consent. |
| C11 | **Course glossary** (Moodle Glossary) | M | S | Course-level terms, linked to the existing Gurbani words data. Gurmukhi first-class; follows the content-accuracy rules. |
| C12 | **Polls, surveys, course evaluations** (Moodle Choice/Feedback, Canvas surveys) | M | S | Course-end evaluation feeds the scholar review board. |
| C13 | **Observer / parent role** (Canvas Observer) | M | M | Read-only view of a child's progress. Relevant for Baal Updesh learners. Needs a consent flow. |
| C14 | **Live sessions + attendance** (Canvas Conferences, Moodle Attendance) | M | M | Link a Jitsi/Zoom session to a cohort date, take attendance. No video hosting by us. |
| C15 | **Completion badges** (Moodle/Canvas Badges, Open Badges 3.0) | L–M | M | Must carry the no-credit disclaimer; never called a credential or credit. |
| C16 | **Course copy / import-export** (IMS Common Cartridge, Moodle backup) | L–M | L | Lets partners bring content in. Rights checks per CONTENT-AND-LICENSING. |
| C17 | **LTI 1.3 / H5P** (both platforms) | L | L | Interactive content and tool interop. Defer until partners ask. |
| C18 | **Direct messaging** (Canvas Inbox, Moodle Messaging) | M | M | **Safeguarding risk with minors.** If built: teacher↔learner only inside a cohort, logged, reportable, admin-visible, and off for under-18 accounts unless an observer is copied. |

Deliberately **not** proposed:
- GPA, letter grades, credit hours, transcripts (the no-degree rules).
- Plagiarism services (cost and privacy).
- Any feature that gates Gurbani content behind payment or enrolment.

### Phasing

1. **Phase 1 (quick wins, about 2 weeks):** C7, C10, C11, C12, and C1 without iCal.
2. **Phase 2 (core teaching, about 3–4 weeks):** C4, C5, C3, C1 iCal.
3. **Phase 3 (assessment depth, about 3–4 weeks):** C2, C6, C9.
4. **Phase 4 (community, as needed):** C8, C13, C14, C15, then C18 only with the
   safeguards above, then C16/C17 on partner demand.

### Cross-cutting rules for every LMS feature

- D1 migrations numbered from `0018_…`, each reversible, each approved before it runs.
- Every create/update/delete and every grade change goes through `logEvent` with
  Part A's structured context.
- Server-side authority for anything graded. No answer keys in the browser.
- i18n: English in markup, new keys in all 8 dictionaries, marked `TODO(native-review)`.
- Accessibility: WCAG 2.1 AA (axe in CI for new pages), RTL, high-contrast, text size.
- No degree/credit language; disclaimers where completion is shown.
- Tests: unit (vitest + SQLite) for every endpoint; a Playwright smoke test for every new
  page.

---

## Decisions needed before starting

1. **IP and device logging:** OK to store IP, country and user agent for 90 days (Part A)?
   This needs a privacy-policy update.
2. **"Remember this device":** add it, or keep it out (B4)?
3. **Direct messaging (C18):** build it with the safeguards above, or leave it out?
4. **Order:** is Part A → Part B → LMS Phase 1 the right order? (B is about one day of work
   and could go first.)
