# SikhiUni: public course outlines, authenticated learning content

Local implementation only. No deployment, R2 upload or commit was performed.

## Public and authenticated routes

Public: home, catalogue, course outlines, professors, programmes, track outlines, learning paths and metadata search. Every generated course page retains its outline and lesson titles. Full free-course lesson HTML, quiz questions and term definitions load through `/api/course-content` after a verified session. Existing institutional courses retain teacher/admin/cohort entitlement checks and D1-published draft delivery. An institutional draft missing from the exported outline still uses those checks, rather than being treated as a free course.

Authenticated: Institute lesson/dojo/capstone/exam/guide pages, martial-arts workshop content, Santhya/read/Baal Updesh pages, media streams, reader/audio assets, exam data and Institute lesson/exam/dojo JSON. Worker checks run before ASSETS or R2 delivery; asset-first exemptions no longer bypass reader/audio checks. Protected responses are private/no-store. Anonymous pages redirect to login with a safe local return path; resource requests fail without delivering their payload. Enrolled users must complete MFA, including legacy sessions whose MFA flag is missing.

The public course JSON is an allowlisted outline, with no lesson bodies, quiz questions, definitions, source-text excerpts or quiz answers. Static builds produce this sanitized copy too. Authenticated quiz delivery never includes answers. Small course objects are cached in server memory for five minutes, at most eight entries and 512 KiB serialized UTF-8 per entry; JS object overhead is additional. Metadata is cached for five minutes with ETag revalidation. Concurrent requests share in-flight reads. Authenticated course delivery uses the existing D1 limiter, 30 requests per user/minute, with its existing fail-open behaviour on limiter failure.

The old 44 MiB catalogue is never read by the new delivery paths. Missing split R2 objects fail closed with no-store 503 responses. Unknown outline IDs do not cause arbitrary private R2 reads; they can only continue through the existing D1 institutional entitlement checks.

## Required deployment sequence

1. Run `node scripts/export-private-courses.mjs` from the repository root. It writes `.course-content-export/` (gitignored), with a checksummed manifest, `courses-outline.json` and one answer-free object per published free course under `course-content/v1/`. Current export: 559 objects, approximately 44 MiB total.
2. Upload those objects before deploying the Worker: `npm --prefix web run deploy-data`. This explicitly invokes the exporter with `--upload`, using the existing Wrangler configuration. It uploads sequentially; a failed object stops the command. **Release upload completed on 29 October 2026: all 559 objects passed SHA-256 readback verification.** Ensure the bucket itself has no public direct-access endpoint; the Worker's `/media/` allowlist excludes these private object prefixes.
3. Build and deploy the Worker/static site through the established release workflow. Without step 2, new course delivery deliberately returns 503; it does not fall back to parsing the large legacy catalogue.
4. Verify anonymous public outlines, anonymous protected resources, authenticated free lessons, institutional cohort access, MFA, logout and media range requests on the deployed origin.

Service worker v31 purges legacy caches, including old offline lesson packs. Protected requests are always network/no-store; offline course capture is disabled. The legacy shell SW is v4. These changes reduce unauthenticated delivery through this origin; they cannot retract earlier downloads or independently hosted public copies.

## Validation

- Full Vitest suite: 791 tests across 49 files passed (local source-scan subprocess allowed outside sandbox).
- Astro production build: 1,313 pages passed, including 558 course outlines.
- Post-build guard: public course copies omit private fields; sampled 100 original lesson bodies absent from client JavaScript; no scroll-reveal-hidden course layout; 32 contrast checks passed.
- Focused tests cover anonymous/verified/partial-MFA/legacy-MFA delivery, institutional unpublished-outline preservation, safe login returns, split-object failure, bounded caches, ETag refresh and SW private-network/purge behaviour.
- Changed JavaScript syntax checks and `git diff --check` passed. No separate lint/typecheck command is defined by this repository; Astro's production compiler completed successfully.

## Release preparation — 29 October 2026

All 559 objects (45,985,077 bytes) were uploaded sequentially and read back with matching SHA-256 hashes. The managed R2 public domain is disabled and the bucket has no custom public domains. The Astro build and all 791 tests passed. The built cache key is `su-web-v31-37d26eaa26db`; the legacy shell is v4. Git commit and Worker deployment are recorded separately in the release receipt.
