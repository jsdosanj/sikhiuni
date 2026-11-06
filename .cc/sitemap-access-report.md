# Public sitemap access-policy correction — 2026-11-06

The shared sitemap serializer now imports `protectedLearningPath` from the serving policy in `functions/api/_course-access.js` and excludes protected entries before XML generation. All build-time child sitemaps already use this serializer, so policy changes remain consistent without duplicating path rules. The sitemap index retains its six nonempty public children.

Regression tests first reproduced 524 protected entries: 5 in pages and 519 in technology, matching the live evidence. The focused policy test also covers encoded and `.html` protected paths while retaining public catalogue/track URLs.

Validation:
- `npm test -- test/sitemap-access.test.ts`: 3 passed after confirming all 3 failed before implementation.
- `npm test`: 51 files / 796 tests passed. The first sandbox run denied an existing test's `/bin/sh` subprocess; the allowed rerun passed.
- `cd web && npm run build`: passed, including public-course payload, reveal and contrast checks.
- `npm exec --yes --package typescript -- tsc --noEmit --allowJs --checkJs false --module esnext --moduleResolution bundler --target esnext --lib esnext,dom --skipLibCheck web/src/lib/sitemap.ts`: passed. There is no configured standalone project typecheck/lint script.
- `git diff --check`: passed.
- Built sitemap inspection: 6 index children exist, 750 URLs total, 0 protected. Counts: pages 20, courses 558, technology 53, programs 11, professors 98, collections 10.

Repository refresh: fetch succeeded; local HEAD and origin/HEAD both `a65d3a5`, so no pull was needed. Initial working tree was clean. Dependencies installed from lockfiles with offline `npm ci --ignore-scripts` at root and web; lockfiles unchanged.

Deployment prepared, not executed: root `wrangler.toml` targets Worker `sikhiuni`, with assets `web/dist` and custom domains `sikhiuni.com` / `www.sikhiuni.com`. Parent review gate is required before publishing. No runtime access-policy changes or private content changes are included.
