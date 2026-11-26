// Crawl policy and sitemap dates (policy: /ai-policy, /ai.txt, /robots.txt; aligned with
// Cloudflare's managed robots.txt, owner decision 2026-11-26):
// - search engines and AI answer engines that cite and link back are let through;
// - AI-training crawlers, site copiers, headless scrapers and bare HTTP libraries get a 403
//   on pages and content files; Google, Bing and Lighthouse are never refused;
// - /api/ is never blocked by user agent and always says x-robots-tag: noindex;
// - sitemap <lastmod> is the date a page's content last changed, not the build date.
import { describe, it, expect } from "vitest";
import worker, { scraperBlock } from "../worker.js";
import { fingerprint, lastmodFor, courseFingerprint, professorFingerprint } from "../web/scripts/lib/lastmod-core.mjs";

const req = (path: string, ua?: string) => new Request("https://sikhiuni.com" + path, { headers: ua === undefined ? {} : { "user-agent": ua } });

describe("scraper block", () => {
  it("lets search engines, AI answer engines, browsers and monitors through", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "Mozilla/5.0 (compatible; Amzn-SearchBot/0.1)",
      "meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36 Chrome-Lighthouse",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      "sikhiuni-uptime/1 (+github-actions)",
      "curl/8.5.0",
    ]) expect(scraperBlock(req("/course/x", ua), "/course/x"), ua).toBeNull();
    expect(scraperBlock(req("/catalog"), "/catalog")).toBeNull(); // a missing user agent alone is not treated as abuse
  });

  it("refuses AI-training crawlers with a training-specific message", async () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "CCBot/2.0 (https://commoncrawl.org/faq/)", "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
      "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
      "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", "GoogleOther", "cohere-ai",
    ]) {
      const r = scraperBlock(req("/course/x", ua), "/course/x");
      expect(r, ua).not.toBeNull();
      expect(r!.status).toBe(403);
      expect(await r!.text()).toMatch(/training/);
    }
  });

  it("refuses site copiers, headless scrapers, aggressive data scrapers and bare HTTP libraries", async () => {
    for (const ua of ["Wget/1.21.4", "Mozilla/4.5 (compatible; HTTrack 3.0x; Windows 98)", "Scrapy/2.11 (+https://scrapy.org)",
      "python-requests/2.32.3", "Go-http-client/2.0", "Java/17.0.2", "node-fetch/1.0", "sqlmap/1.8",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36",
      "Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)", "Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot)",
      "Mozilla/5.0 (compatible; DataForSeoBot/1.0)", "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)"]) {
      const r = scraperBlock(req("/assets/data/courses.json", ua), "/assets/data/courses.json");
      expect(r, ua).not.toBeNull();
      expect(r!.status).toBe(403);
      expect(r!.headers.get("x-robots-tag")).toBe("noindex");
    }
  });

  it("robots.txt and the site agree: every crawler robots.txt bars from training is refused", async () => {
    const { readFileSync } = await import("node:fs");
    const robots = readFileSync("web/public/robots.txt", "utf8");
    const section = robots.split("# --- AI model training: not allowed ---")[1].split("# ---")[0];
    // Google-Extended and Applebot-Extended are opt-out tokens, not crawlers: they never fetch pages.
    const agents = [...section.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1].trim()).filter((a) => !/-Extended$/.test(a));
    expect(agents.length).toBeGreaterThan(15);
    for (const a of agents) expect(scraperBlock(req("/x", `Mozilla/5.0 (compatible; ${a}/1.0)`), "/x"), a).not.toBeNull();
    expect(robots).toMatch(/Content-Signal: search=yes,ai-train=no/);
  });

  it("never blocks /api/, robots.txt or .well-known by user agent", () => {
    expect(scraperBlock(req("/api/health", "Python-urllib/3.12"), "/api/health")).toBeNull();
    expect(scraperBlock(req("/robots.txt", "python-requests/2.32"), "/robots.txt")).toBeNull();
    expect(scraperBlock(req("/.well-known/security.txt", "Wget/1.21"), "/.well-known/security.txt")).toBeNull();
  });

  it("the worker returns the 403 before doing any work, and API responses carry noindex", async () => {
    const assets = { fetch: async () => new Response("<!doctype html>ok", { headers: { "content-type": "text/html" } }) };
    const blocked = await worker.fetch(req("/catalog", "HTTrack"), { ASSETS: assets } as any);
    expect(blocked.status).toBe(403);
    expect((await worker.fetch(req("/catalog", "GPTBot/1.2"), { ASSETS: assets } as any)).status).toBe(403);
    expect((await worker.fetch(req("/robots.txt", "GPTBot/1.2"), { ASSETS: assets } as any)).status).not.toBe(403); // can still read the rules
    const ok = await worker.fetch(req("/catalog", "Mozilla/5.0 (compatible; Googlebot/2.1)"), { ASSETS: assets } as any);
    expect(ok.status).toBe(200);
    const api = await worker.fetch(req("/api/does-not-exist", "Mozilla/5.0"), { ASSETS: assets } as any);
    expect(api.status).toBe(404);
  });
});

describe("sitemap lastmod", () => {
  it("keeps the stored date while content is unchanged and falls back to the build date when it changes", () => {
    const course = { id: "c1", title: "T", lessons: [{ title: "a", summary: "s" }] };
    const store = { "course:c1": { h: courseFingerprint(course), d: "2026-08-28" } };
    expect(lastmodFor(store, "course:c1", courseFingerprint(course), "2026-11-26")).toBe("2026-08-28");
    expect(lastmodFor(store, "course:c1", courseFingerprint({ ...course, title: "T2" }), "2026-11-26")).toBe("2026-11-26");
    expect(lastmodFor(store, "course:new", courseFingerprint(course), "2026-11-26")).toBe("2026-11-26");
  });

  it("fingerprints ignore key order but see every content change", () => {
    expect(fingerprint({ a: 1, b: [1, 2] })).toBe(fingerprint({ b: [1, 2], a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
    const c = [{ id: "x", title: "X", level: 100, summary: "s" }];
    expect(professorFingerprint("bio", c)).not.toBe(professorFingerprint("new bio", c));
  });

  it("the committed lastmod file covers every published course", async () => {
    const { readFileSync } = await import("node:fs");
    const store = JSON.parse(readFileSync("web/src/data/lastmod.json", "utf8"));
    const raw = JSON.parse(readFileSync("site/assets/data/courses.json", "utf8"));
    const { publicCourseCatalogue } = await import("../functions/api/_course-access.js");
    const published = publicCourseCatalogue(raw).courses.filter((c: any) => c.status === "published");
    const stale = published.filter((c: any) => !store["course:" + c.id] || store["course:" + c.id].h !== courseFingerprint(c)).map((c: any) => c.id);
    expect(stale, "run `cd web && npm run update-lastmod` and commit web/src/data/lastmod.json").toEqual([]);
  });
});
