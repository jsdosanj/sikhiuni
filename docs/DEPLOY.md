# Deploy runbook

Operational reference for the live Sikhi University Worker
(`sikhiuni.com`). Architecture is described in
[BACKEND-cloudflare.md](BACKEND-cloudflare.md).

## The moving parts
A full production update can touch three independent things:

1. **Code + static site** — `worker.js`, `functions/api/*`, and the Astro build (`web/dist`).
   Shipped by `wrangler deploy`. The `[build]` command in `wrangler.toml` builds the
   frontend first: `cd web && npm install && npm run build && rm -f dist/assets/data/courses.json`.
2. **Course catalogue** — `site/assets/data/courses.json`. Served from R2, **not** from the
   deploy, so it must be pushed separately (see below).
3. **Client cache** — the service worker (`web/public/sw.js`) caches the app shell. Bump its
   cache version to force clients to refresh immediately.

## Deploy the code + site

### Automatic (default)
Production **auto-deploys on merge to `master`** via GitHub Actions. Every push and PR to
`master` first runs the CI validation workflow (`.github/workflows/ci.yml`):

- `node --check` on `site/assets/app.js`, `worker.js`, and every file under `functions/`;
- `python3 scripts/validate.py` on the course catalogue.

Merge the PR once CI is green and the deploy job publishes the Worker to production.

### Manual fallback
From a maintainer laptop with `wrangler` authenticated to the Dosanjh Labs account:

```bash
wrangler deploy        # runs the [build] command, then publishes worker.js + web/dist
```

## Push the course catalogue to R2 (required after any catalogue change)
`site/assets/data/courses.json` (~43 MB) exceeds Cloudflare's 25 MiB asset limit, so the
build strips it from `web/dist` and the Worker serves it from R2 (`worker.js`). **`wrangler
deploy` alone does NOT update the catalogue** — the R2 object must be pushed separately, or
the site will show a stale course count.

After any change to `site/assets/data/courses.json`:

```bash
cd web && npm run deploy-data
# = wrangler r2 object put sikh-university-media/courses.json \
#     --file ../site/assets/data/courses.json --remote --config ../wrangler.toml
```

The Worker caches the R2 object for 1 hour. For an immediate client refresh, bump the
service-worker cache (below) and redeploy.

## Bump the service-worker cache
Edit the cache version at the top of `web/public/sw.js`:

```js
var CACHE = 'su-web-v11';   // → 'su-web-v12', etc.
```

Incrementing it invalidates the old app-shell cache so returning clients pick up the new
build on next load. Redeploy the site after bumping.

## Domain: sikhiuni.com cutover
The canonical domain is `sikhiuni.com`. The legacy `sikh-university.dosanjhlabs.com`
custom domain stays bound and 301-redirects every path (preserving path + query) to the new
domain — see [SEO.md](SEO.md) for why it must stay bound indefinitely. **Do not remove that
route.**

`wrangler deploy` auto-provisions both custom domains from `wrangler.toml`. If a deploy fails
on a DNS conflict for `sikhiuni.com`, it means a stale/conflicting DNS record already exists
in the Cloudflare zone — delete the conflicting record and redeploy.

`MAIL_FROM` still sends from `login@dosanjhlabs.com` (already verified as a sending domain in
Resend). To switch outbound mail to `login@sikhiuni.com`: first verify `sikhiuni.com` as a
sending domain in Resend (SPF/DKIM records), then update `MAIL_FROM` in `wrangler.toml` and
redeploy.

## D1 schema & migrations
The authoritative schema is `schema.sql`. Most tables are created with `IF NOT EXISTS`, and
several are also auto-created by their handlers on first write (discussions, ratings,
certificates, gradebook, announcements, enrollments, feedback, audit events) — so new
handlers need no manual migration.

Apply the schema to a database:

```bash
wrangler d1 execute sikh-university --remote --file schema.sql     # --local for local dev
```

### Adding columns to existing tables (one-off migrations)
`IF NOT EXISTS` does not add columns to a table that already exists. When a column is added,
run the `ALTER TABLE` once against the live DB. Example — the profile columns added to
`users`:

```bash
wrangler d1 execute sikh-university --remote --command "ALTER TABLE users ADD COLUMN country TEXT"
wrangler d1 execute sikh-university --remote --command "ALTER TABLE users ADD COLUMN languages TEXT"
```

(The `enrollments` table auto-creates on first write, so it needs no migration.)

## Sikhi Studio publishing (owner setup, one time)
Sikhi University is one of two receivers of sikhi.io's Sikhi Studio publish protocol
(the other is Panjabi Uni). sikhi.io signs and posts a finished, human-reviewed Studio
item to `POST /api/studio-publish` (`functions/api/studio-publish.js`); this site
verifies the signature, then lands it as a `submitted` row in the **existing** course
review queue (`/api/review/queue`) — a scholar (or admin) must approve it like any
teacher-authored draft. Nothing from Studio ever goes live without that step. Full
protocol: sikhi.io's `docs/studio/publish-protocol.md`.

1. **Apply the migration** (idempotent, `CREATE TABLE IF NOT EXISTS`):

   ```bash
   wrangler d1 execute sikh-university --remote --file ./migrations/0016_studio_inbound.sql
   ```

2. **Set the shared secret** — generated once by whoever owns sikhi.io and shared with
   you out of band (never commit it). It must be the SAME value sikhi.io has under
   `STUDIO_PUBLISH_SECRET_SIKHIUNI`:

   ```bash
   wrangler secret put STUDIO_PUBLISH_SECRET
   ```

   Until this is set (or if it's ever shorter than 32 characters), the route refuses
   every request with `503 { code: "not_configured" }` rather than accepting anything
   unsigned.

3. **Optional: `STUDIO_PUBLISH_TOPIC`** — which of this site's catalogue topics
   (`site/assets/data/courses.json` → `topics`) a Studio-published course is filed
   under. Defaults to `spirituality` (a generic Sikhi-practice topic, since a Studio
   item can come from any org's book/audio/video, not necessarily doctrine-specific).
   Set it to another topic id from that list if you'd rather Studio courses land
   somewhere else:

   ```bash
   wrangler secret put STUDIO_PUBLISH_TOPIC    # e.g. "history", "theology" — a plain var is fine too
   ```

Rotating the secret: set the new value here AND on sikhi.io's
`STUDIO_PUBLISH_SECRET_SIKHIUNI` together — requests signed with the old value start
failing with `401 bad_signature` and sikhi.io retries them with the new one.

## Web Push reminders (VAPID secrets — owner setup, one time)
The daily coursework-reminder push (cron in `wrangler.toml`, sender in
`functions/push-sender.js`) is a no-op until a VAPID keypair exists. The whole feature
degrades to hidden without it: `GET /api/push/key` returns 404 and the dashboard opt-in
never renders.

1. Generate a keypair locally (any machine with npm):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Set the three secrets on the Worker (dashboard → Settings → Variables and Secrets,
   or CLI):

   ```bash
   wrangler secret put VAPID_PUBLIC_KEY    # the generated public key (base64url, starts with B)
   wrangler secret put VAPID_PRIVATE_KEY   # the generated private key
   wrangler secret put VAPID_SUBJECT       # mailto:you@example.com or https://sikhiuni.com/feedback
   ```

3. Deploy (or just merge — the next deploy picks the secrets up). No code change needed.

Notes:
- Pushes are **payload-less**: the server sends an empty VAPID-signed push and the
  service worker (`web/public/sw.js`) supplies the notification text. No payload
  encryption, no message content stored server-side.
- Subscriptions live in the D1 `push_subs` table (auto-created on first subscribe);
  dead endpoints (404/410 from the push service) are pruned automatically each sweep.
- The cron fires daily at 16:00 UTC. iOS requires 16.4+ **and** the site installed to
  the home screen (Share → Add to Home Screen) before notification permission can be
  requested; Android Chrome and desktop browsers work from the normal tab.
- Rotating the keypair invalidates every stored subscription — users re-opt-in on
  their next visit. Prefer never rotating unless the private key leaks.

## Santhya audio indexes + parallel texts (owner steps)
- **Verify audio URLs** (one command, network required — the cloud sandbox can't reach
  gurmatveechar.com): `node scripts/verify-audio-index.mjs`. Checks every SGGS + Dasam
  segment URL and auto-rewrites the index with the correct gurmatveechar filename pattern
  if any guess missed; commit the diff if it changes anything.
- **Dasam index regeneration** (only if the track list changes):
  `node scripts/build_dasam_audio_index.mjs` (offline; reads scripts/dasam-tracks.json).
- **Panj Granthavali parallel texts**: `HF_TOKEN=hf_... python3 scripts/export_parallel_texts.py`
  exports page-aligned Gurmukhi ⇄ English JSONs into web/public/assets/parallel/ for the
  five study courses; commit them and the course pages' "Parallel text" panel lights up.

## Local development
Root scripts drive local dev:

```bash
npm install       # root + web dependencies
npm run dev       # Worker + Astro frontend together
npm run db:seed   # seed a local D1 database
```

To create/bind resources for a fresh environment:

```bash
wrangler d1 create sikh-university          # then set database_id in wrangler.toml
wrangler r2 bucket create sikh-university-media
wrangler d1 execute sikh-university --local --file schema.sql
```

`RESEND_API_KEY` is a secret. Without it, `functions/api/auth/request.js` runs in dev mode
and returns the magic link in the response instead of emailing it.

## Backups & restore (D1)
Export a full snapshot:

```bash
wrangler d1 export sikh-university --remote --output backup.sql
```

Restore into a database from that snapshot:

```bash
wrangler d1 execute sikh-university --remote --file backup.sql
```

D1 Time Travel can also roll a database back without a manual snapshot:

```bash
wrangler d1 time-travel info sikh-university
wrangler d1 time-travel restore sikh-university --timestamp="2026-07-01T00:00:00Z"
```

R2 media/catalogue objects are re-pushable from source (`npm run deploy-data` for the
catalogue); keep the source `courses.json` and media under version control / backup as the
source of truth.
