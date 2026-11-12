# Plan: audit logging, optional MFA, and Moodle/Canvas-class LMS features

Status: **approved 2026-11-11, in progress.** Written 2026-11-11 against `master` @ `1422996`.

## Decisions (owner, 2026-11-11)

1. Do all of Part A (context, missing events, integrity and retention, admin tools, learner panel).
2. Store IP and device for **90 days**, then null them; update the privacy policy.
3. Part B: remove the teacher publish requirement; add **"Remember this device for 30 days"**.
4. Build all 18 LMS features (C1–C18), plus the LMS security section (Part D).
5. Messaging (replaces the C18 draft):
   - Course **forums** for every course.
   - **Direct messages between classmates** (learners enrolled in the same course).
   - Each first contact is a **message request** the recipient must approve.
   - Teachers can change every messaging setting in their own courses.
6. Order: Part B → Part A (+ privacy policy) → LMS Phase 1 → 2 → 3 → 4.
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
4. **"Remember this device for 30 days" (approved).** A checkbox on the MFA step. It
   sets a signed, httpOnly, Secure `sikhiuni_mfa_dev` cookie holding a random device
   token. Only the token's hash is stored, in a `mfa_trusted_devices` table, bound to the
   user and expiring in 30 days. A new sign-in that presents a valid token skips the code.
   - All of a user's tokens are revoked when MFA is disabled, reset by an admin, or the
     password changes, and by "Sign out everywhere".
   - Use and revocation are logged.
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
| C3 | **Modules with completion rules / conditional release** (Moodle Restrict access, Canvas Module requirements) | H | M | "Unlock lesson 4 after the quiz ≥ 80%". Must stay **optional** per course: open access is a core value. **Owner decision 2026-11-12: teachers may lock lessons too** (enforced server-side in course-content.js; teachers/admins always see all; with no rule everything stays open). |
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
| C18 | **Course forums + classmate messaging** (Moodle Forums/Messaging, Canvas Discussions/Inbox) | H | L | Owner's design, see "Messaging design" below. |

Deliberately **not** proposed:
- GPA, letter grades, credit hours, transcripts (the no-degree rules).
- Plagiarism services (cost and privacy).
- Any feature that gates Gurbani content behind payment or enrolment.

### Messaging design (C18, approved)

- **Course forums.** Every course gets a forum: the existing threaded `discussions` plus
  forum categories (Q&A, General, Announcements-only), pinned/locked threads (already
  supported), subscriptions (via C5 notifications), and teacher moderation (already
  supported).
- **Classmate direct messages.** Only between users who share an enrolment in a course
  where DMs are enabled. A conversation is tied to the course it started in.
- **Message requests.** The first message from A to B is a *request*. B sees the sender,
  the course and the first message, then chooses Accept, Decline, or Block. Nothing more
  can be sent until B accepts. Decline is silent; Block stops further requests from A.
  Each new conversation needs its own approval.
- **Teacher course settings** (teachers of that course, and admins):
  - forums on/off;
  - DMs on/off;
  - who may start DMs (learners / teachers only);
  - whether teachers can read DMs in their course (shown to learners when on);
  - a profanity/link filter;
  - per-learner mute;
  - locking or archiving the course forum.
- **Safety.**
  - Every message is reportable, with a report queue for teachers and admins.
  - Rate limits apply, and messages are plain text only, with links unlinked by default.
  - Blocks are honoured everywhere.
  - Admins can see reported conversations; every send, request decision, block and
    report is logged in the audit log.
  - The policy for under-18 accounts (observer copied, Part C13) is applied once
    observers exist.

### Phasing

1. **Phase 1 (quick wins, about 2 weeks):** C7, C10, C11, C12, and C1 without iCal.
2. **Phase 2 (core teaching, about 3–4 weeks):** C4, C5, C3, C1 iCal.
3. **Phase 3 (assessment depth, about 3–4 weeks):** C2, C6, C9.
4. **Phase 4 (community):** C8, C13, C14, C15, C16, C17.
   C18 (forums + classmate DMs) moves up into Phase 2.

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

## Part D. LMS security improvements

These apply to every LMS feature, as well as to what exists today.

1. **One authorisation helper per resource**, e.g. `canTeach(user, courseId)` and
   `isEnrolled(user, courseId)`, used by every LMS endpoint. Today the ownership checks
   are copied separately into each handler (`assignments.js`, `gradebook.js`,
   `cohorts.js`, …), so they can drift apart. Every denial is logged as `authz_denied`.
2. **IDOR tests.** For every new endpoint, a learner from course X must get 403 on course
   Y's data; a teacher of X must get 403 on Y.
3. **Input handling.** Server-side length caps on all text. Rich text goes through the
   existing `_sanitize-html.js` only. Messages and forum posts are plain text, with
   auto-linking off by default.
4. **Uploads.** Reuse the `upload.js` magic-byte and type allowlist. Files are served
   only through the authorised `asset.js` path. Strip EXIF from images; add a size quota
   per user per course.
5. **Rate limits** on every write endpoint (messages, posts, requests, polls, journal),
   added to `RATE_LIMITS` in `worker.js`.
6. **Privacy by default.**
   - Journals are private.
   - Teacher read access to DMs is visible to learners when switched on.
   - Observers see progress, never messages.
   - Analytics never expose one learner's data to another learner.
7. **Grading integrity.**
   - Answer keys stay server-side.
   - Quiz attempts are signed, time-limited server tokens.
   - The anti-oracle rules extend to new question types.
   - Every grade or extension change records before/after in the audit log.
8. **CSRF / origin check.** The session cookie is `SameSite=Lax`. Add an `Origin` check
   for state-changing `/api/*` requests, as defence in depth.
9. **Session security.**
   - "Sign out everywhere" (Part A).
   - The remember-device cookie is bound to the user and revoked when MFA is disabled or
     reset.
   - Session ids are stored hashed in audit rows.
10. **Data lifecycle.** Account export and account delete include every new table
    (messages, journals, poll votes, …), and account merge moves them. Tests guard this.

## Decisions (resolved 2026-11-11, see top; kept for history)

1. **IP and device logging:** OK to store IP, country and user agent for 90 days (Part A)?
   This needs a privacy-policy update.
2. **"Remember this device":** add it, or keep it out (B4)?
3. **Direct messaging (C18):** build it with the safeguards above, or leave it out?
4. **Order:** is Part A → Part B → LMS Phase 1 the right order? (B is about one day of work
   and could go first.)
