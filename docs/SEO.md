# SEO runbook

How Sikhi University gets found and ranked, worldwide. Written for whoever ships the next
deploy — including an AI agent, not just the person who built it.

## Architecture summary

The site is a **fully static, prerendered Astro build** (`web/dist`) served by the Worker's
`ASSETS` binding — no client-side rendering gate, no hydration required for content to be
crawlable. This is close to ideal for SEO: every route returns complete HTML on first
response.

- **Per-page metadata.** `web/src/layouts/Base.astro` takes `title`, `description`, and
  `canonical` props; every page sets a unique title and description. Canonical URLs default
  to the current path on `https://sikhiuni.com` unless overridden.
- **Social cards.** Open Graph and Twitter Card tags are emitted alongside the canonical tag
  in `Base.astro` for every page.
- **JSON-LD.** Structured data is inlined per page:
  - `Organization` + `WebSite` (with a `SearchAction` pointing at `/search?q={query}`) —
    emitted site-wide from `Base.astro`.
  - `CollegeOrUniversity` — homepage (`web/src/pages/index.astro`).
  - `Course` + `BreadcrumbList` — every course page (`web/src/pages/course/[id].astro`),
    generated at build time from the catalogue.
  - `Person` — professor pages (`web/src/pages/professor/[slug].astro`).
  - `FAQPage` / `ItemList` also appear on `about.astro` and `catalog.astro` where relevant.
  - Keep new page types consistent with this pattern: compute the `ld` object, inline it as
    `<script type="application/ld+json" set:html={ldJson(ld)} slot="head" />` — `ldJson`
    (from `web/src/lib/site.ts`) escapes `<` so free-text fields can't break out of the
    script element.
- **`robots.txt`** (`web/public/robots.txt`) takes an open policy: `Allow: /` for
  everyone, including named AI search/answer bots (OAI-SearchBot, ChatGPT-User,
  Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Applebot,
  Amzn-SearchBot/-User, meta-webindexer, meta-externalfetcher, MistralAI-Index/-User,
  DuckAssistBot) and AI/ML training crawlers alike — we want to be cited in AI answers and
  trained on. There are no `Disallow` rules. The human-readable rationale lives in
  `web/public/ai.txt` and `/ai-policy`; keep both in sync with any future change here.
- **Sitemap.** `https://sikhiuni.com/sitemap.xml` is a sitemap **index**, with child sitemaps
  at `/sitemaps/pages.xml`, `/sitemaps/courses.xml`, `/sitemaps/programs.xml`,
  `/sitemaps/professors.xml`, and `/sitemaps/collections.xml`. Each child's `lastmod` is the
  build date. Admin/auth/utility routes (login, dashboard, admin, verify, etc.) are
  intentionally excluded — they are not indexable content.

## Domain migration checklist (one-time)

Do this once, in order, after the `sikhiuni.com` rebrand ships:

1. **Deploy** — merge to `master`. Domain provisioning, DNS-conflict recovery and the
   MAIL_FROM/Resend switch live in `docs/DEPLOY.md` → "Domain: sikhiuni.com cutover" (the
   single source of truth for cutover operations).
2. **Verify the cutover** — confirm `https://sikhiuni.com` loads, and that
   `https://sikh-university.dosanjhlabs.com/anything` 301-redirects to
   `https://sikhiuni.com/anything` (path + query preserved; `/api/` and `/media/` are
   deliberately served in place on the legacy host so stale clients keep working).
3. **Google Search Console** — add `sikhiuni.com` as a **Domain property** and verify via
   the DNS TXT record (covers all subdomains/protocols in one property).
4. **Submit the sitemap** — `https://sikhiuni.com/sitemap.xml` in the new property.
5. **Change of Address** — on the *old* property (`sikh-university.dosanjhlabs.com`), use
   Settings → Change of Address, pointing at the new `sikhiuni.com` property. This tells
   Google to transfer ranking signal instead of treating it as two sites.
6. **Bing Webmaster Tools** — use "Import from Google Search Console" to pull in the new
   domain in one step. Bing's index also powers DuckDuckGo, Yahoo, and Ecosia, so this
   covers four engines at once.
7. **Keep the legacy route bound indefinitely** — `docs/DEPLOY.md` explains why the
   `sikh-university.dosanjhlabs.com` route and its 301s must never be removed.

## IndexNow

The site ships an IndexNow key file at `web/public/f59b13b5e863a021f1afc9be79af4a0a.txt` (see that file for the actual
key — a 32-character hex filename whose contents are the same key). `scripts/indexnow_ping.py`
pings the IndexNow endpoint automatically on every push to `master`, via the "Notify search
engines" step in `.github/workflows/deploy.yml` — no manual step needed. It submits a fixed
set of core pages (home, catalog, programs, about, professors, santhiya, search) plus any
course whose `courses.json` entry differs from the previous commit (new or edited courses),
for near-instant re-crawling from Bing, DuckDuckGo (via Bing), Seznam, and Naver. Best-effort:
a failed submission (network blip, API downtime) logs a warning and never fails the deploy.

To ping manually (e.g. after a change that isn't a `courses.json` diff, or to test):

```
python3 scripts/indexnow_ping.py
```

Or by hand, for a single URL:

```
GET https://api.indexnow.org/indexnow?url=https://sikhiuni.com/&key=f59b13b5e863a021f1afc9be79af4a0a
```

This is optional and additive — it does not replace the sitemap, it just speeds up discovery
of new/changed URLs on the engines that support the protocol.

## Ongoing practices

- **Every new page** needs a unique `title` (under 60 characters) and `description`
  (140–160 characters) passed to `Base.astro`. Don't ship a page with the default
  description.
- **Course pages get `Course` + `BreadcrumbList` JSON-LD automatically** from the catalogue —
  no per-course manual work required. If a course is missing from the sitemap or has bad
  structured data, the bug is upstream in the catalogue or the generator, not the page.
- **Don't `noindex` anything already excluded from the sitemap** — the sitemap's exclusion
  list (admin/auth/utility routes) is the source of truth for what's indexable. Adding a
  `noindex` tag on top of that is redundant; adding one to a page that *is* in the sitemap is
  almost certainly a mistake.
- **Monitor Search Console coverage monthly** — watch for a rise in "Excluded" or "Crawled –
  not indexed" pages, which usually signals a template regression (missing canonical, broken
  JSON-LD, thin content) rather than a search-engine issue.
- **hreflang: deliberately absent.** The site translates client-side, at a single URL per
  page (see the `autoTranslate` prop on `Base.astro`); the server-rendered HTML that crawlers
  see is always English regardless of the visitor's language. Shipping `hreflang` alternates
  pointing at `?lang=` variants would tell crawlers
  those URLs serve different-language HTML when they don't — misleading, and likely to hurt
  rather than help international ranking. Shareable `?lang=` deep links exist for humans
  (chat links, social shares), not for crawlers. Revisit this only if per-locale
  server-rendered/prerendered pages are ever adopted; until then, ship no hreflang tags.
