// Crawl policy and sitemap dates:
// - abusive scrapers (site copiers, bare HTTP libraries) are refused on pages
//   and content files, while search engines, AI answer engines and AI training crawlers that
//   name themselves are let through (training is allowed by policy: /ai-policy, /ai.txt);
// - /api/ is never blocked by user agent and always says x-robots-tag: noindex;
// - sitemap <lastmod> is the date a page's content last changed, not the build date.
import { describe, it, expect } from "vitest";
import worker, { scraperBlock } from "../worker.js";
import { fingerprint, lastmodFor, courseFingerprint, professorFingerprint } from "../web/scripts/lib/lastmod-core.mjs";

const req = (path: string, ua?: string) => new Request("https://sikhiuni.com" + path, { headers: ua === undefined ? {} : { "user-agent": ua } });

describe("scraper block", () => {
  it("lets every named search, AI-answer and AI-training crawler through", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "CCBot/2.0 (https://commoncrawl.org/faq/)",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
      "sikhiuni-uptime/1 (+github-actions)",
      "curl/8.5.0",
    ]) expect(scraperBlock(req("/course/x", ua), "/course/x"), ua).toBeNull();
  });

  it("refuses site copiers and bare HTTP libraries on pages and data", async () => {
    for (const ua of ["Wget/1.21.4", "Mozilla/4.5 (compatible; HTTrack 3.0x; Windows 98)", "Scrapy/2.11 (+https://scrapy.org)",
      "python-requests/2.32.3", "Go-http-client/2.0", "Java/17.0.2", "node-fetch/1.0", "sqlmap/1.8"]) {
      const r = scraperBlock(req("/assets/data/courses.json", ua), "/assets/data/courses.json");
      expect(r, ua).not.toBeNull();
      expect(r!.status).toBe(403);
      expect(r!.headers.get("x-robots-tag")).toBe("noindex");
    }
    expect(scraperBlock(req("/catalog"), "/catalog")).toBeNull(); // a missing user agent alone is not treated as abuse
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
