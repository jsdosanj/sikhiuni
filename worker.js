// Sikhi University Worker entrypoint.
// Static files from the Astro build (web/dist) are served by the [assets]
// binding -- NOT site/, which is legacy and unreachable (confirmed 2026-09-06
// against wrangler.toml's `[assets] directory = "./web/dist"`). /api/* is dispatched
// to the existing handlers (unchanged) that live under functions/api/.
import { onRequestGet as meGet, onRequestPost as mePost } from "./functions/api/me.js";
import { onRequestPost as activityHeartbeatPost } from "./functions/api/activity/heartbeat.js";
import { onRequestGet as activityStatsGet } from "./functions/api/activity/stats.js";
import { onRequestGet as progressGet, onRequestPost as progressPost } from "./functions/api/progress.js";
import { onRequestPost as authRequestPost } from "./functions/api/auth/request.js";
import { onRequestGet as authVerifyGet } from "./functions/api/auth/verify.js";
import { onRequestPost as authLogoutPost } from "./functions/api/auth/logout.js";
import { onRequestGet as authSsoGet } from "./functions/api/auth/sso.js";
import { onRequestPost as authSignupPost } from "./functions/api/auth/signup.js";
import { onRequestPost as authRegisterStartPost } from "./functions/api/auth/register-start.js";
import { onRequestPost as authRegisterCompletePost } from "./functions/api/auth/register-complete.js";
import { onRequestPost as authLoginPost } from "./functions/api/auth/login.js";
import { onRequestPost as authForgotPasswordPost } from "./functions/api/auth/forgot-password.js";
import { onRequestPost as authVerifyResetCodePost } from "./functions/api/auth/verify-reset-code.js";
import { onRequestPost as authResetPasswordPost } from "./functions/api/auth/reset-password.js";
import { onRequestPost as mfaEnrollPost } from "./functions/api/auth/mfa/enroll.js";
import { onRequestPost as mfaConfirmPost } from "./functions/api/auth/mfa/confirm.js";
import { onRequestPost as mfaVerifyPost } from "./functions/api/auth/mfa/verify.js";
import { onRequestPost as mfaDisablePost } from "./functions/api/auth/mfa/disable.js";
import { onRequestGet as teacherProfileGet, onRequestPost as teacherProfilePost } from "./functions/api/teacher/profile.js";
import { onRequestGet as teachersGet } from "./functions/api/teachers.js";
import { onRequestGet as teacherClaimGet, onRequestPost as teacherClaimPost } from "./functions/api/teacher/claim.js";
import { onRequestGet as adminTeacherProfilesGet, onRequestPost as adminTeacherProfilesPost } from "./functions/api/admin/teacher-profiles.js";
import { onRequestGet as adminClaimsGet, onRequestPost as adminClaimsPost } from "./functions/api/admin/claims.js";
import { TEACHER_PUBLIC_COLS, presentTeacherProfile } from "./functions/api/_teacher-page.js";
import { serveR2Object } from "./functions/api/_r2-serve.js";
import { onRequestPost as uploadPost } from "./functions/api/upload.js";
import { onRequestPost as uploadCreatePost } from "./functions/api/upload/create.js";
import { onRequestPut as uploadPartPut } from "./functions/api/upload/part.js";
import { onRequestPost as uploadCompletePost } from "./functions/api/upload/complete.js";
import { onRequestPost as uploadAbortPost } from "./functions/api/upload/abort.js";
import { onRequestGet as assetGet } from "./functions/api/asset.js";
import { onRequestGet as adminUploadsGet, onRequestPost as adminUploadsPost } from "./functions/api/admin/uploads.js";
import { onRequestPost as teacherApplyPost } from "./functions/api/teacher/apply.js";
import { onRequestGet as adminAppsGet, onRequestPost as adminAppsPost } from "./functions/api/admin/applications.js";
import { onRequestPost as feedbackPost } from "./functions/api/feedback.js";
import { onRequestGet as adminFeedbackGet } from "./functions/api/admin/feedback.js";
import { onRequestGet as adminStatsGet } from "./functions/api/admin/stats.js";
import { onRequestGet as adminUsersGet, onRequestPost as adminUsersPost } from "./functions/api/admin/users.js";
import { onRequestGet as adminCourseTeachersGet, onRequestPost as adminCourseTeachersPost } from "./functions/api/admin/course-teachers.js";
import { onRequestGet as adminEventsGet } from "./functions/api/admin/events.js";
import { onRequestGet as gradebookGet, onRequestPost as gradebookPost } from "./functions/api/gradebook.js";
import { onRequestPost as quizPost } from "./functions/api/quiz.js";
import { onRequestGet as courseContentGet } from "./functions/api/course-content.js";
import { onRequestPost as programExamPost } from "./functions/api/program-exam.js";
import { onRequestPost as instituteExamPost } from "./functions/api/institute-exam.js";
import { onRequestGet as announcementsGet, onRequestPost as announcementsPost } from "./functions/api/announcements.js";
import { onRequestGet as discussionsGet, onRequestPost as discussionsPost } from "./functions/api/discussions.js";
import { onRequestGet as discussionsModerateGet, onRequestPost as discussionsModeratePost } from "./functions/api/discussions/moderate.js";
import { onRequestPost as discussionsReportPost } from "./functions/api/discussions/report.js";
import { onRequestGet as assignmentsGet, onRequestPost as assignmentsPost } from "./functions/api/assignments.js";
import { onRequestGet as submissionsGet, onRequestPost as submissionsPost } from "./functions/api/submissions.js";
import { onRequestPost as submissionsGradePost } from "./functions/api/submissions/grade.js";
import { onRequestGet as studioDraftsGet, onRequestPost as studioDraftsPost } from "./functions/api/studio/drafts.js";
import { onRequestGet as studioDraftGet, onRequestPost as studioDraftPost } from "./functions/api/studio/draft.js";
import { onRequestPost as studioLessonPost } from "./functions/api/studio/lesson.js";
import { onRequestPost as studioQuizPost } from "./functions/api/studio/quiz.js";
import { onRequestGet as studioValidateGet } from "./functions/api/studio/validate.js";
import { onRequestPost as studioSubmitPost } from "./functions/api/studio/submit.js";
import { onRequestGet as reviewQueueGet } from "./functions/api/review/queue.js";
import { onRequestGet as reviewDraftGet } from "./functions/api/review/draft.js";
import { onRequestPost as reviewDecisionPost } from "./functions/api/review/decision.js";
import { onRequestGet as adminDraftsExportGet } from "./functions/api/admin/drafts-export.js";
import { onRequestPost as adminDraftsMarkPublishedPost } from "./functions/api/admin/drafts-mark-published.js";
import { onRequestGet as teacherArchiveRequestGet, onRequestPost as teacherArchiveRequestPost } from "./functions/api/teacher/archive-request.js";
import { onRequestGet as adminArchiveRequestsGet, onRequestPost as adminArchiveRequestsPost } from "./functions/api/admin/archive-requests.js";
import { onRequestGet as adminArchiveRequestsExportGet } from "./functions/api/admin/archive-requests-export.js";
import { onRequestGet as ratingsGet, onRequestPost as ratingsPost } from "./functions/api/ratings.js";
import { onRequestGet as certGet, onRequestPost as certPost } from "./functions/api/certificates.js";
import { onRequestGet as enrollmentsGet, onRequestPost as enrollmentsPost } from "./functions/api/enrollments.js";
import { onRequestGet as accountExportGet } from "./functions/api/account/export.js";
import { onRequestPost as accountDeletePost } from "./functions/api/account/delete.js";
import { onRequestPost as translatePost } from "./functions/api/translate.js";
import { onRequestGet as cohortsGet, onRequestPost as cohortsPost } from "./functions/api/cohorts.js";
import { onRequestGet as healthGet } from "./functions/api/health.js";
import { onRequestPost as pushSubscribePost } from "./functions/api/push/subscribe.js";
import { onRequestPost as pushUnsubscribePost } from "./functions/api/push/unsubscribe.js";
import { onRequestGet as pushKeyGet } from "./functions/api/push/key.js";
import { sendDailyReminders } from "./functions/push-sender.js";

// path -> { GET, POST } handlers. Each handler takes { request, env }.
const routes = {
  "/api/me": { GET: meGet, POST: mePost },
  "/api/activity/heartbeat": { POST: activityHeartbeatPost },
  "/api/activity/stats": { GET: activityStatsGet },
  "/api/progress": { GET: progressGet, POST: progressPost },
  "/api/auth/request": { POST: authRequestPost },
  "/api/auth/verify": { GET: authVerifyGet },
  "/api/auth/logout": { POST: authLogoutPost },
  "/api/auth/sso": { GET: authSsoGet },
  "/api/auth/signup": { POST: authSignupPost },  // 410 since 2026-09-06 — kept so a stale client gets an explicit answer
  "/api/auth/register-start": { POST: authRegisterStartPost },
  "/api/auth/register-complete": { POST: authRegisterCompletePost },
  "/api/auth/login": { POST: authLoginPost },
  "/api/auth/forgot-password": { POST: authForgotPasswordPost },
  "/api/auth/verify-reset-code": { POST: authVerifyResetCodePost },
  "/api/auth/reset-password": { POST: authResetPasswordPost },
  "/api/auth/mfa/enroll": { POST: mfaEnrollPost },
  "/api/auth/mfa/confirm": { POST: mfaConfirmPost },
  "/api/auth/mfa/verify": { POST: mfaVerifyPost },
  "/api/auth/mfa/disable": { POST: mfaDisablePost },
  "/api/teacher/profile": { GET: teacherProfileGet, POST: teacherProfilePost },
  "/api/teachers": { GET: teachersGet },
  "/api/teacher/claim": { GET: teacherClaimGet, POST: teacherClaimPost },
  "/api/admin/teacher-profiles": { GET: adminTeacherProfilesGet, POST: adminTeacherProfilesPost },
  "/api/admin/claims": { GET: adminClaimsGet, POST: adminClaimsPost },
  "/api/upload": { POST: uploadPost },
  "/api/upload/create": { POST: uploadCreatePost },
  "/api/upload/part": { PUT: uploadPartPut },
  "/api/upload/complete": { POST: uploadCompletePost },
  "/api/upload/abort": { POST: uploadAbortPost },
  "/api/asset": { GET: assetGet },
  "/api/admin/uploads": { GET: adminUploadsGet, POST: adminUploadsPost },
  "/api/teacher/apply": { POST: teacherApplyPost },
  "/api/admin/applications": { GET: adminAppsGet, POST: adminAppsPost },
  "/api/feedback": { POST: feedbackPost },
  "/api/admin/feedback": { GET: adminFeedbackGet },
  "/api/admin/stats": { GET: adminStatsGet },
  "/api/admin/users": { GET: adminUsersGet, POST: adminUsersPost },
  "/api/admin/course-teachers": { GET: adminCourseTeachersGet, POST: adminCourseTeachersPost },
  "/api/admin/events": { GET: adminEventsGet },
  "/api/gradebook": { GET: gradebookGet, POST: gradebookPost },
  "/api/quiz": { POST: quizPost },
  "/api/course-content": { GET: courseContentGet },
  "/api/program-exam": { POST: programExamPost },
  "/api/institute-exam": { POST: instituteExamPost },
  "/api/announcements": { GET: announcementsGet, POST: announcementsPost },
  "/api/discussions": { GET: discussionsGet, POST: discussionsPost },
  "/api/discussions/moderate": { GET: discussionsModerateGet, POST: discussionsModeratePost },
  "/api/discussions/report": { POST: discussionsReportPost },
  "/api/assignments": { GET: assignmentsGet, POST: assignmentsPost },
  "/api/submissions": { GET: submissionsGet, POST: submissionsPost },
  "/api/submissions/grade": { POST: submissionsGradePost },
  "/api/studio/drafts": { GET: studioDraftsGet, POST: studioDraftsPost },
  "/api/studio/draft": { GET: studioDraftGet, POST: studioDraftPost },
  "/api/studio/lesson": { POST: studioLessonPost },
  "/api/studio/quiz": { POST: studioQuizPost },
  "/api/studio/validate": { GET: studioValidateGet },
  "/api/studio/submit": { POST: studioSubmitPost },
  "/api/review/queue": { GET: reviewQueueGet },
  "/api/review/draft": { GET: reviewDraftGet },
  "/api/review/decision": { POST: reviewDecisionPost },
  "/api/admin/drafts-export": { GET: adminDraftsExportGet },
  "/api/admin/drafts-mark-published": { POST: adminDraftsMarkPublishedPost },
  "/api/teacher/archive-request": { GET: teacherArchiveRequestGet, POST: teacherArchiveRequestPost },
  "/api/admin/archive-requests": { GET: adminArchiveRequestsGet, POST: adminArchiveRequestsPost },
  "/api/admin/archive-requests-export": { GET: adminArchiveRequestsExportGet },
  "/api/ratings": { GET: ratingsGet, POST: ratingsPost },
  "/api/certificates": { GET: certGet, POST: certPost },
  "/api/enrollments": { GET: enrollmentsGet, POST: enrollmentsPost },
  "/api/account/export": { GET: accountExportGet },
  "/api/account/delete": { POST: accountDeletePost },
  "/api/translate": { POST: translatePost },
  "/api/cohorts": { GET: cohortsGet, POST: cohortsPost },
  "/api/health": { GET: healthGet },
  "/api/push/subscribe": { POST: pushSubscribePost },
  "/api/push/unsubscribe": { POST: pushUnsubscribePost },
  "/api/push/key": { GET: pushKeyGet },
};

// Per-IP rate limit for each POST endpoint: { limit, window (seconds) }. Enforced with an
// atomic D1 counter (checkRateLimit below) — the Cloudflare experimental `ratelimit`
// binding silently failed open in testing (65 rapid requests, 0 blocked), so we don't
// rely on it.
const RATE_LIMITS = {
  "/api/auth/request": { limit: 20, window: 60 },  // magic-link sends (anti mail-bomb)
  "/api/auth/forgot-password": { limit: 20, window: 60 },  // password-reset sends (same rule -- this is where Resend cost actually lives now)
  "/api/auth/verify-reset-code": { limit: 10, window: 60 },  // 6-digit code brute-force guard, same as MFA verify
  "/api/auth/login": { limit: 30, window: 60 },  // password guess throttle
  "/api/auth/signup": { limit: 20, window: 60 },
  // register-start SENDS MAIL, so it gets the anti-mail-bomb limit, not the
  // looser signup one. register-complete is a 6-digit code guess, so it gets
  // the same treatment as the MFA code check below.
  "/api/auth/register-start": { limit: 20, window: 60 },
  "/api/auth/register-complete": { limit: 10, window: 60 },
  "/api/translate": { limit: 60, window: 60 },     // paid Workers AI — cap per-IP cost
  "/api/feedback": { limit: 15, window: 60 },
  "/api/discussions": { limit: 15, window: 60 },
  "/api/ratings": { limit: 15, window: 60 },
  "/api/push/subscribe": { limit: 10, window: 60 },
  "/api/push/unsubscribe": { limit: 10, window: 60 },
  "/api/auth/mfa/verify": { limit: 10, window: 60 },  // 6-digit code brute-force guard
  "/api/teacher/profile": { limit: 10, window: 60 },
  "/api/teacher/claim": { limit: 5, window: 60 },
  "/api/teacher/archive-request": { limit: 5, window: 60 },
  "/api/discussions/report": { limit: 5, window: 60 },
  "/api/submissions": { limit: 10, window: 60 },
  // Grading endpoints. These score against server-only answer keys, so the
  // response is the only channel back to an attacker — which makes repeated
  // submission the way you reconstruct a key. The handlers each refuse to be a
  // single-question oracle (quiz.js grades against the full key length,
  // institute-exam.js and program-exam.js require a minimum sample and own their
  // pass mark), but none of them was throttled, so a boundary-tuning attack could
  // run at full speed. A real learner submits a lesson check or an exam a handful
  // of times a minute at most; these caps are far above honest use and well below
  // useful brute-force. Fails open like every other limit here (CSO 2026-09-09).
  "/api/quiz": { limit: 30, window: 60 },
  "/api/program-exam": { limit: 10, window: 60 },
  "/api/institute-exam": { limit: 10, window: 60 },
};
const RL_ENFORCE = true;

// Atomic fixed-window per-key limiter on D1. Strongly consistent, so a fast burst can't
// slip through on stale reads the way a KV counter would. Fails OPEN on any error / no DB
// so a limiter problem never locks out the mission's users. Creates its table lazily,
// once per isolate.
let rlReady = false;
async function checkRateLimit(env, key, limit, windowSec) {
  if (!env.DB) return true;
  try {
    if (!rlReady) {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)").run();
      rlReady = true;
    }
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      "INSERT INTO rate_limits (k, count, reset_at) VALUES (?1, 1, ?2) " +
      "ON CONFLICT(k) DO UPDATE SET " +
      "count = CASE WHEN reset_at <= ?3 THEN 1 ELSE count + 1 END, " +
      "reset_at = CASE WHEN reset_at <= ?3 THEN ?2 ELSE reset_at END " +
      "RETURNING count"
    ).bind(key, now + windowSec, now).first();
    return !row || row.count <= limit;
  } catch (e) { return true; }
}

// The site's canonical home. Requests reaching the Worker on a legacy hostname
// (the old custom domain or the bare workers.dev alias) are permanently
// redirected here, preserving path + query, so old links, bookmarks and search
// results carry over. Dev/preview hosts (localhost, versioned workers.dev
// previews) are deliberately NOT redirected.
const CANONICAL_ORIGIN = "https://sikhiuni.com";
const LEGACY_HOSTS = new Set([
  "www.sikhiuni.com",
  "sikh-university.com",
  "www.sikh-university.com",
  "sikh-university.dosanjhlabs.com",
  "sikh-university.jasvant-dosanjh.workers.dev",
]);

// Worker-rendered /teacher/:slug — fetches the Astro-built shell (real CSS bundle,
// real i18n attributes: zero design drift) and rewrites title/meta/JSON-LD/canonical
// server-side with HTMLRewriter, so crawlers get real SEO data with JS disabled,
// then injects a JSON data island so the client hydration script needs no second fetch.
function renderTeacherPage(profile, assignedCourseIds, shellResp) {
  const pub = presentTeacherProfile(profile);
  const title = `${pub.displayName} — Sikhi University`;
  const description = (pub.bio ? pub.bio.slice(0, 300) : `${pub.displayName} teaches at Sikhi University.`);
  const canonical = `${CANONICAL_ORIGIN}/teacher/${pub.slug}`;
  const photoUrl = pub.photoUrl ? `${CANONICAL_ORIGIN}${pub.photoUrl}` : undefined;
  const personLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: pub.displayName,
      url: canonical,
      ...(pub.bio ? { description: pub.bio } : {}),
      ...(photoUrl ? { image: photoUrl } : {}),
    },
  };
  const ldJson = JSON.stringify(personLd).replace(/</g, "\\u003c");
  const dataIsland = JSON.stringify({ ...pub, assignedCourseIds }).replace(/</g, "\\u003c");

  const rewriter = new HTMLRewriter()
    .on("title", { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', { element(e) { e.setAttribute("content", description); } })
    .on('link[rel="canonical"]', { element(e) { e.setAttribute("href", canonical); } })
    .on('meta[property="og:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[property="og:description"]', { element(e) { e.setAttribute("content", description); } })
    .on('meta[property="og:url"]', { element(e) { e.setAttribute("content", canonical); } })
    .on('meta[name="twitter:title"]', { element(e) { e.setAttribute("content", title); } })
    .on('meta[name="twitter:description"]', { element(e) { e.setAttribute("content", description); } })
    .on("head", {
      element(e) {
        e.append(`<script type="application/ld+json">${ldJson}</script>`, { html: true });
        e.append(`<script type="application/json" id="profile-data">${dataIsland}</script>`, { html: true });
      },
    });

  const transformed = rewriter.transform(shellResp);
  const headers = new Headers(transformed.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  // No unsafe-inline needed: this response has no deliberate inline scripts (the
  // hydration script is Astro-bundled to an external file; the two injected
  // blocks are non-executable JSON types that need no CSP allowance at all).
  headers.set("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; media-src 'self' https:; font-src 'self'; " +
    "connect-src 'self'; frame-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");
  return new Response(transformed.body, { status: 200, headers });
}

// Best-effort daily prune of tables that only ever grow (rate_limits is
// insert/update-only in checkRateLimit above; sessions/magic_tokens are never
// deleted on expiry, only filtered by expires_at at read time). Each table is
// independent so one failing DELETE can't block the others.
async function pruneExpired(env) {
  if (!env.DB) return { skipped: true };
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const jobs = [
    ["rate_limits", "DELETE FROM rate_limits WHERE reset_at < ?1", nowSec],
    ["sessions", "DELETE FROM sessions WHERE expires_at < ?1", nowMs],
    ["magic_tokens", "DELETE FROM magic_tokens WHERE expires_at < ?1", nowMs],
  ];
  const result = {};
  for (const [table, sql, param] of jobs) {
    try {
      const { meta } = await env.DB.prepare(sql).bind(param).run();
      result[table] = meta.changes;
    } catch (e) { result[table] = `error: ${String(e)}`; }
  }
  return result;
}

export default {
  // Daily coursework reminder sweep + best-effort table prune (wrangler.toml
  // [triggers]). Payload-less Web Push: the service worker supplies the
  // notification text.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDailyReminders(env).then((r) => {
      if (!r.skipped) console.log("push_reminders", JSON.stringify(r));
    }).catch((e) => console.error("push_reminders_error", String(e))));
    ctx.waitUntil(pruneExpired(env).then((r) => {
      if (!r.skipped) console.log("prune_expired", JSON.stringify(r));
    }).catch((e) => console.error("prune_expired_error", String(e))));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    // Pages/assets on a legacy host 301 to the canonical origin. /api/,
    // /media/ and /assets/data/ are exempt and served in place: a 301 turns
    // POST into a bodyless GET (per the Fetch spec), which would silently
    // break auth/progress/quiz calls from stale clients, and the runtime
    // catalogue fetch (/assets/data/courses.json, served from R2 by this
    // Worker) must keep working for pages viewed on the legacy origin — a
    // cross-origin redirect there breaks program/dashboard/cert course
    // loading whenever the canonical domain is unreachable or interstitial-
    // blocked (e.g. during a Safe Browsing review).
    if (LEGACY_HOSTS.has(url.hostname) && !pathname.startsWith("/api/") && !pathname.startsWith("/media/") && !pathname.startsWith("/assets/data/")) {
      return Response.redirect(CANONICAL_ORIGIN + pathname + url.search, 301);
    }
    // The engineering wing moved /institute -> /technology (2026-08). 301 the
    // old paths, preserving the sub-path and query. Kept in run_worker_first so
    // the Worker actually runs for these.
    if (pathname === "/institute" || pathname.startsWith("/institute/")) {
      return Response.redirect(CANONICAL_ORIGIN + "/technology" + pathname.slice("/institute".length) + url.search, 301);
    }
    if (pathname.startsWith("/api/")) {
      const route = routes[pathname];
      if (!route) {
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404, headers: { "content-type": "application/json" },
        });
      }
      const handler = route[request.method];
      if (!handler) {
        return new Response(JSON.stringify({ error: "method not allowed" }), {
          status: 405, headers: { "content-type": "application/json" },
        });
      }
      // Rate limiting, keyed per client IP. Count-only unless RL_ENFORCE: a
      // limiter outage or an over-limit burst must never lock out the mission's
      // shared-NAT users, so it fails open and (for now) only logs.
      // POST and PUT both carry a body worth rate-limiting (PUT: /api/upload/part).
      const rl = (request.method === "POST" || request.method === "PUT") ? RATE_LIMITS[pathname] : null;
      if (rl) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        const ok = await checkRateLimit(env, `${pathname}:${ip}`, rl.limit, rl.window);
        if (!ok) {
          console.warn("rate_limit_exceeded", pathname, ip);
          if (RL_ENFORCE) {
            return new Response(JSON.stringify({ error: "rate_limited" }), {
              status: 429, headers: { "content-type": "application/json", "retry-after": "60" },
            });
          }
        }
      }
      // Single choke point: any handler exception returns a JSON 500 (never a raw
      // Cloudflare HTML error page) and is logged so failures are observable.
      try {
        return await handler({ request, env });
      } catch (err) {
        console.error("api_error", request.method, pathname, err && err.stack || String(err));
        return new Response(JSON.stringify({ error: "server_error" }), {
          status: 500, headers: { "content-type": "application/json" },
        });
      }
    }
    // Audio + media streamed from R2 (zero egress), same-origin so <audio> + CSP work.
    if (pathname.startsWith("/media/")) {
      const key = decodeURIComponent(pathname.slice("/media/".length));
      // Only serve known public prefixes so the rest of the bucket can never be
      // read via /media/ (defence-in-depth against a latent full-bucket disclosure).
      // uploads/ is deliberately NEVER added here — private-by-construction; see
      // functions/api/asset.js for the access-controlled read path for uploads.
      if (!key || key.includes("..") || !/^(santhya|audio|gurbani|media)\//.test(key)) {
        return new Response("Not found", { status: 404 });
      }
      const resp = await serveR2Object(env, request, key);
      return resp || new Response("Not found", { status: 404 });
    }
    // courses.json is too large for Cloudflare's 25 MiB asset limit; serve from R2 instead.
    if (pathname === '/assets/data/courses.json') {
      const obj = await env.MEDIA.get('courses.json');
      if (!obj) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      headers.set('cache-control', 'public, max-age=3600');
      headers.set('access-control-allow-origin', '*');
      return new Response(obj.body, { status: 200, headers });
    }
    // Worker-rendered teacher public profile. Falls through to the Astro 404 (the
    // final branch below) on an invalid/unknown/private slug — this branch only
    // ever returns early on a HIT, so "not found" needs no special-casing here.
    if (pathname.startsWith("/teacher/") && pathname !== "/teacher/") {
      const slug = decodeURIComponent(pathname.slice("/teacher/".length)).replace(/\/$/, "");
      if (/^[a-z0-9-]+$/.test(slug)) {
        const profile = await env.DB.prepare(
          `SELECT ${TEACHER_PUBLIC_COLS} FROM teacher_profiles WHERE slug=? AND is_public=1`
        ).bind(slug).first().catch(() => null);
        if (profile) {
          const { results } = await env.DB.prepare("SELECT course_id FROM course_teachers WHERE user_id=?")
            .bind(profile.user_id).all().catch(() => ({ results: [] }));
          const shellResp = await env.ASSETS.fetch(new Request(new URL("/teacher-shell", request.url), request));
          if (shellResp.ok) return renderTeacherPage(profile, (results || []).map((r) => r.course_id), shellResp);
        }
      }
    }
    // Worker-served sitemap for teacher profiles (D1-backed, so it reflects new
    // profiles without a redeploy — unlike the build-time Astro sitemaps).
    if (pathname === "/sitemaps/teachers.xml") {
      const { results } = await env.DB.prepare(
        "SELECT slug, updated_at FROM teacher_profiles WHERE is_public=1 ORDER BY slug"
      ).all().catch(() => ({ results: [] }));
      const body =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        (results || []).map((r) =>
          `  <url><loc>${CANONICAL_ORIGIN}/teacher/${r.slug}</loc><lastmod>${new Date(r.updated_at).toISOString().slice(0, 10)}</lastmod><priority>0.5</priority></url>`
        ).join("\n") +
        `\n</urlset>\n`;
      return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
    }
    // Everything else: the Astro static build. NOTE — without `run_worker_first`,
    // Cloudflare serves any request that matches a file in the assets manifest
    // (nearly every page) directly from the edge and never reaches this code; it
    // only runs for paths with no matching static file (e.g. a 404). The site-wide
    // security + AI-policy headers below are therefore a defense-in-depth backstop
    // — the ones that actually apply to real pages live in web/public/_headers,
    // which Cloudflare's asset layer honours on every static response.
    const assetResp = await env.ASSETS.fetch(request);
    const ct = assetResp.headers.get('content-type') || '';
    const h = new Headers(assetResp.headers);
    // AI-crawler policy: all AI crawling is welcome, including AI answer/search
    // engines and AI/ML training. Per-bot rules live in /robots.txt and /ai.txt;
    // human-readable policy at /ai-policy. Search indexing is untouched (no
    // noindex here) and never was restricted.
    // The Code Lab's sandboxed runner workers (Vite emits them to /_lab/,
    // routed here by run_worker_first). They execute learner code: the JS
    // runner does `new Function(snippet)` (needs 'unsafe-eval'); the Python
    // runner imports Pyodide from jsDelivr and fetches its wasm/stdlib. This
    // widened policy is scoped to exactly those worker files — same-origin,
    // no DOM, cannot touch the page — so the site-wide CSP stays strict.
    if (pathname.startsWith('/_lab/')) {
      h.set('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net; " +
        "connect-src 'self' https://cdn.jsdelivr.net; " +
        "worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'");
      return new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: h });
    }

    if (!ct.includes('text/html')) {
      return new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: h });
    }
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('X-Frame-Options', 'DENY');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

    // Institute of Technology — /technology/* (routed here by run_worker_first):
    // the code lab runs Python via Pyodide ('wasm-unsafe-eval' + the jsDelivr CDN) and renders
    // learner HTML in a sandboxed srcdoc iframe (frame-src 'self'). Take the
    // asset layer's OWN hash-hardened CSP (from web/public/_headers, post
    // build-csp) and only widen those three directives — everything else the
    // site forbids stays forbidden. Falls back to the hardened baseline if the
    // asset response somehow carried no CSP.
    if (pathname === '/technology' || pathname.startsWith('/technology/')) {
      const assetCsp = assetResp.headers.get('content-security-policy')
        || "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' https:; font-src 'self'; connect-src 'self' blob: https://api.banidb.com https://cloudflareinsights.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; worker-src 'self' blob:; form-action 'self'; base-uri 'self'; frame-ancestors 'none'";
      const CDN = 'https://cdn.jsdelivr.net';
      const instCsp = assetCsp
        .replace(/script-src ([^;]*)/, `script-src $1 'wasm-unsafe-eval' ${CDN}`)
        .replace(/connect-src ([^;]*)/, `connect-src $1 ${CDN}`)
        .replace(/frame-src ([^;]*)/, "frame-src 'self' $1");
      h.set('Content-Security-Policy', instCsp);
      return new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: h });
    }

    // Single authoritative CSP for HTML documents (this override wins over the
    // static _headers file, so the CSP lives here only). connect-src is tightened
    // to the one external origin the client actually calls (the BaniDB verse viewer).
    h.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; media-src 'self' https:; font-src 'self'; " +
      "connect-src 'self' blob: https://api.banidb.com https://cloudflareinsights.com; " +
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com; " +
      "worker-src 'self' blob:; " +
      "form-action 'self' https://formsubmit.co; base-uri 'self'; frame-ancestors 'none'");
    return new Response(assetResp.body, { status: assetResp.status, statusText: assetResp.statusText, headers: h });
  },
};
