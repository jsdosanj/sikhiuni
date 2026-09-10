# Operations runbook

How Sikhi University is deployed, monitored, and recovered. Written for whoever is on
call — including an AI agent or a future sevadar, not just the person who built it.

## Deploy

Production is a single Cloudflare Worker (`worker.js`) serving the Astro build in
`web/dist` plus the `/api/*` handlers.

- **Auto-deploy on merge.** A Cloudflare Workers Build git integration runs on every push
  to `master`: it runs the `wrangler.toml` `[build]` command (`cd web && npm install &&
  npm run build`) and deploys. No GitHub secret is needed for this.
- **The build is the gate.** `npm run build` runs the catalogue validator, the answer-strip
  assertion, and the Gurbani accuracy gate (`web/scripts/verify-gurbani.mjs`) before Astro
  builds, so a bad catalogue or a quote that contradicts canonical text fails the deploy.
- **Manual fallback.** The Cloudflare build can take 2+ minutes and occasionally does not
  self-complete. If a merge hasn't gone live within a few minutes, deploy from an
  authenticated machine: `wrangler deploy` (uses your `wrangler login` OAuth). Verify with
  `curl -s https://sikhiuni.com/api/health`.
- **Catalogue → R2.** The browser-served catalogue (`courses.json`, answer-stripped) is
  published to R2 by `.github/workflows/deploy.yml` on merge — but only if the repo secret
  `CLOUDFLARE_API_TOKEN` is set (R2 Storage:Edit). Without it, that step skips; publish
  manually with `cd web && npm run deploy-data`.

## Monitoring

- **`GET /api/health`** probes D1 and R2 directly and returns `{ok,db,r2}` (503 if either is
  down). A D1 outage looks like a healthy homepage otherwise, so always check this endpoint.
- **`uptime.yml`** curls `/api/health` + the homepage every 30 min and emails on failure.
- **`freshness.yml`** fails daily if the canonical snapshot is 100+ days old (a stalled
  refresh).

## Runbooks

**D1 (database) down / corrupted.** Symptoms: logins fail, dashboards empty, `/api/health`
`db:false`. There is no failover — D1 has built-in point-in-time restore (Time Travel, 7
days): `wrangler d1 time-travel restore sikh-university --timestamp=<ISO>`. For older data,
restore from the monthly export in the `sikh-university-backups` R2 bucket
(`wrangler d1 execute sikh-university --remote --file=<dump.sql>`). Communicate via a banner
while restoring.

**R2 (storage) down.** Symptoms: the catalogue or audio won't load, `/api/health` `r2:false`.
Nothing to fail over to; wait for Cloudflare. (Most course data moved off R2 in the
data-layer split, so the blast radius is media + the legacy `courses.json` route.)

**`uptime.yml` job hangs or gets cancelled instead of failing fast.** Both curl calls carry
`--connect-timeout 10 --max-time 30 --retry 2`, and the job has `timeout-minutes: 5` — so as
of this hardening, a genuine hang should self-terminate and email within ~5 minutes, not run
until someone notices and cancels it. If it still happens: open the failed run's log — the
script echoes progressively, so the last line printed pins the failure down:
- Nothing past `Probing …/api/health` → the health request never got a response (DNS/TLS/
  connect-level; check for a Cloudflare incident or a WAF/Safe-Browsing interstitial on the
  domain — `worker.js` has prior history with the latter).
- `HTTP 200` then a `bindings:` line with `db:false` or `r2:false` → a real binding outage;
  see the D1/R2 runbooks above.
- Hang or a non-200 only after `Probing …/ (homepage)` → homepage-specific (edge/WAF), not
  D1/R2 — the health probe already ruled those out.
Also check whether the *job itself* is stuck in `queued` status (visible in the Actions tab)
rather than running — that's a GitHub-hosted-runner allocation delay, not a production issue,
and is outside this repo's control; re-run once runners are available.

**Resend (email) down / quota exhausted.** Symptom: `/api/auth/request` returns 502; existing
sessions keep working (30-day cookie). Sign-in is fully email-dependent — check the Resend
dashboard quota and bump if needed. Failures are logged (`auth_request` errors in Workers
Logs).

**Snapshot refresh failed.** The freshness canary will alert. Re-run
`Refresh Gurbani snapshot` via `workflow_dispatch`, or locally:
`python3 scripts/build_gurbani_snapshot.py` then open a PR. CI re-verifies quotes against
the new snapshot; a mismatch means BaniDB changed a tuk a course quotes — review before merge.

**Accuracy gate failed a PR/deploy.** A quoted shabad does not match canonical text at its
cited ang, or cites the wrong ang. The build log names the course + ang. Fix the quote (or
the `data-ang`) — do not weaken the gate.

**Sole admin locked out of MFA.** The single admin account (from `ADMIN_EMAILS`) lost their
authenticator and can't clear `/mfa`. Recovery ladder: their own backup codes first; if
those are gone too, delete the enrollment directly against production D1 — this is safe
because admin identity is already anchored to `ADMIN_EMAILS` + mailbox control, not to MFA
itself:
```bash
wrangler d1 execute sikh-university --remote --command \
  "DELETE FROM user_mfa WHERE user_id IN (SELECT id FROM users WHERE email='<admin email>')"
```
They can then sign in via magic link and re-enroll from `/mfa`. The same `mfa_reset` action
is available for a locked-out teacher from the admin Teachers tab (`POST /api/admin/users
{id, action:'mfa_reset'}`) — no direct D1 access needed for that case. Since 2026-09-10 an
un-enrolled admin is no longer blocked from `/api/admin/*` at all, so this ladder only
applies to an admin who HAS enrolled and then lost the authenticator.

**Adding an admin.** Admin is conferred by the `ADMIN_EMAILS` Worker secret — a
comma-separated allowlist, not a single address — and nothing in the app can grant it
(`/api/admin/users` refuses to set `role='admin'` on purpose). Two steps, both required:
1. Add the address to the secret. It is a secret, not a `[vars]` entry, so it is set from
   the Cloudflare dashboard or `wrangler secret put ADMIN_EMAILS` with the FULL new list —
   the command replaces the value, it does not append.
2. Set the role on the existing row, because only registration and SSO login read the
   allowlist; a password login never re-checks it, so an account that predates the secret
   change stays a `learner` until either an SSO login or this:
   ```bash
   wrangler d1 execute sikh-university --remote --command \
     "UPDATE users SET role='admin' WHERE email='<new admin email>'"
   ```
Skipping step 1 is the trap: `functions/api/auth/sso.js` DEMOTES any `role='admin'` user
whose email is not in `ADMIN_EMAILS` the next time they arrive via SSO, so a role set only
in D1 silently reverts.

**Merging duplicate accounts.** One person, two `users` rows (registered under one email,
later arrived under another — Apple private-relay addresses make this common). An admin
merges them from the admin **Users** tab, or directly:
`POST /api/admin/users {action:'merge', sourceId, targetId}`.

- Coursework moves: progress, enrolments, certificates, ratings, submissions, daily
  activity, grade overrides, cohort memberships, teaching assignments, discussions,
  applications, claims, feedback, push subscriptions, flags, teacher profile, drafts,
  announcements, archive requests, assignments, cohorts, media. The full list is
  `OWNED`/`ACTOR` in `functions/api/admin/_merge-account.js`.
- Credentials do NOT move: the source's password, MFA enrollment, backup codes, reset
  codes and sessions are deleted with it. **The surviving account keeps only the sign-in
  methods it already had** — check it can actually be signed into before merging away the
  other one. An account with no `password_hash` signs in via SSO, family credentials, or by
  using forgot-password to set a first password.
- On a key collision (both accounts hold a row for the same course, or the same day of
  activity) the SURVIVING account's row is kept and the duplicate's is dropped. The
  response reports these as `skipped` per table, and the `account_merge` audit event
  records them — nothing is lost silently, but it is lost.
- `events` is deliberately not rewritten: it is an append-only audit log, and the
  `account_merge` event is what ties the old id to the surviving account afterwards.
- `users.role` is not inherited. If the merged-away account was the admin, add the
  surviving address to `ADMIN_EMAILS` per "Adding an admin" above.

**Importing approved course drafts.** Scholar review happens in D1 (`/review`); publishing a
course is still a git PR, never a runtime mutation. Once one or more drafts are
`status='approved'`:
1. Confirm the `EXPORT_TOKEN` repo secret is set (Settings → Secrets and variables → Actions)
   — it must match the `EXPORT_TOKEN` Worker secret.
2. Run the import: `gh workflow run import-drafts.yml` (or trigger it from the Actions tab).
   Zero approved drafts → the job exits cleanly, no PR.
3. Review the opened `import/drafts-YYYY-MM-DD` PR like any other catalogue change — it runs
   the full existing gate suite (`validate.py`, quiz-key parity, answer-strip, emoji, CSP).
4. Once it merges and deploys, click **Mark published** next to each course in the admin
   Review tab (or `POST /api/admin/drafts-mark-published {draftId}`) to close the loop in D1.

**Retiring a published course.** A teacher can't delete a live, git-managed catalogue entry
directly — no staging environment, and courses.json has a no-shrink CI guard. Instead a
teacher files a request from their dashboard (`POST /api/teacher/archive-request
{courseId, reason}`), which an admin reviews in the Review tab's "Course archive requests"
section:
1. Approve or deny the pending request. Approving queues it for the next import run.
2. Run `gh workflow run import-drafts.yml` — the same run that imports approved drafts also
   fetches approved archive requests and flips the matching course's `status` to `"archived"`
   in the same PR. Archived courses drop out of `/catalog`, search, sitemaps, and quiz grading,
   but existing enrollments/certificates/progress records are untouched.
3. If this drops the published count below `scripts/catalogue-baseline.json`'s
   `published_min`, `validate.py` will (correctly) fail the PR until you re-run with
   `ALLOW_CATALOGUE_SHRINK=1` and lower `published_min` in the same change — this is the
   guard doing its job (a deliberate archive, not a corrupt file), not a bug.
4. Once the PR merges and deploys, click **Mark archived** in the Review tab (or
   `POST /api/admin/archive-requests {id, decision:'mark_archived'}`) to close the loop in D1.

**Institutional (gated) courses.** A teacher marks a draft "Institutional" (Studio's Overview
tab, `visibility` field) instead of "Public." At publish time
(`functions/api/admin/drafts-export.js`) the exported catalogue entry carries `gated: true`
but `lessons: []` / `quiz: []` — the real content stays in D1's `draft_lessons`/`draft_quiz`
permanently and is never written to git. The course still appears in `/catalog` and search
with its title and summary; `course/[id].astro` renders a teaser instead of lesson content for
everyone else. Full content and grading are served to the course's teacher/admin, or to a
member of a `cohorts` cohort tied to that course (`functions/api/course-content.js`,
`functions/api/quiz.js`) — sikhiuni.com never processes payment itself; a licensing
institution collects payment on its own site and simply hands buyers the cohort's existing
invite code (`/cohorts`).

## Content

- **Add/edit a course:** edit `site/assets/data/courses.json`, then run
  `python3 scripts/validate.py`, `python3 scripts/build_quiz_keys.py`, and
  `python3 scripts/build_paths.py`. The build regenerates the slim indexes and the
  verification report. See CONTRIBUTING.md.
- **Refresh the canonical snapshot:** `python3 scripts/build_gurbani_snapshot.py` (monthly
  via `snapshot-refresh.yml`).

## Known pending ops tasks

- Move `ADMIN_EMAILS` from `wrangler.toml [vars]` to a Worker secret
  (`wrangler secret put ADMIN_EMAILS`) — the local OAuth token could not write secrets; do
  it from the Cloudflare dashboard. Code reads it identically either way.
- Add the `CLOUDFLARE_API_TOKEN` repo secret (R2 Storage:Edit) to enable the automatic R2
  catalogue sync and archival backup workflows.
- Set the two Worker secrets the teacher platform needs before it can run in production:
  `wrangler secret put MFA_ENC_KEY` (base64 256-bit key, e.g.
  `openssl rand -base64 32`) and `wrangler secret put EXPORT_TOKEN` (any long random
  string — mirror it as a GitHub repo secret of the same name for `import-drafts.yml`).
