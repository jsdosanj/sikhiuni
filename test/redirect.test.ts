import { describe, it, expect } from "vitest";
import worker from "../worker.js";

// INVARIANT: the site's canonical origin is https://sikhiuni.com. Any request
// reaching the Worker on a legacy production hostname must 301 to the canonical
// origin with path + query preserved, so old links and search results carry
// over. Dev/preview hosts must NOT be redirected.

const htmlAssets = {
  fetch: async () =>
    new Response("<!doctype html>ok", { headers: { "content-type": "text/html" } }),
};

describe("canonical-host redirect", () => {
  it("301s the old custom domain to sikhiuni.com, preserving path + query", async () => {
    const res = await worker.fetch(
      new Request("https://sikh-university.dosanjhlabs.com/course/abc?x=1&y=2"),
      { ASSETS: htmlAssets },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://sikhiuni.com/course/abc?x=1&y=2");
  });

  it("301s the legacy sikh-university.com alias to sikhiuni.com, preserving path + query", async () => {
    const res = await worker.fetch(
      new Request("https://sikh-university.com/course/abc?x=1"),
      { ASSETS: htmlAssets },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://sikhiuni.com/course/abc?x=1");
  });

  it("301s the bare workers.dev alias", async () => {
    const res = await worker.fetch(
      new Request("https://sikh-university.jasvant-dosanjh.workers.dev/"),
      { ASSETS: htmlAssets },
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://sikhiuni.com/");
  });

  it("does NOT redirect /api/ on a legacy host (301 would turn POSTs into bodyless GETs for stale clients)", async () => {
    const res = await worker.fetch(
      new Request("https://sikh-university.dosanjhlabs.com/api/health"),
      { ASSETS: htmlAssets },
    );
    // The handler runs in place (503 here — the mock env has no DB); the
    // invariant is that it is NOT a redirect.
    expect([301, 302, 307, 308]).not.toContain(res.status);
    expect(res.headers.get("location")).toBeNull();
  });

  it("serves the R2 catalogue in place on a legacy host (no cross-origin redirect for runtime data)", async () => {
    const res = await worker.fetch(
      new Request("https://sikh-university.dosanjhlabs.com/assets/data/courses.json"),
      {
        ASSETS: htmlAssets,
        MEDIA: { get: async () => ({ body: '{"courses":[]}', size: 14, writeHttpMetadata() {} }) },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("serves the canonical host without redirecting", async () => {
    const res = await worker.fetch(new Request("https://sikhiuni.com/"), {
      ASSETS: htmlAssets,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("TDM-Reservation")).toBeNull();
  });

  it("leaves dev/preview hosts alone (localhost keeps working under wrangler dev)", async () => {
    const res = await worker.fetch(new Request("http://localhost:8787/"), {
      ASSETS: htmlAssets,
    });
    expect(res.status).toBe(200);
  });
});
