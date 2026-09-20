// Magic-link sign-in is retired (2026-09-06). These are regression guards, not
// coverage of a feature: the flow emailed a link on every use, and its verify
// half CREATED AN ACCOUNT for any unknown address — an implicit registration
// path with no password, no username and no confirmation step.
//
// The strongest assertion here is the last one: neither file may import
// anything that could bring the behavior back. A "retired" route that still
// pulls in the DB, the email templates and a session-cookie helper is one bad
// merge away from being live again.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { onRequestPost as requestPost } from "../functions/api/auth/request.js";
import { onRequestGet as verifyGet } from "../functions/api/auth/verify.js";

const ROOT = path.resolve(__dirname, "..");

describe("POST /api/auth/request — retired", () => {
  it("410s and names the replacement path", async () => {
    const res = await requestPost({} as any);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: "gone",
      use: "password sign-in; use forgot-password if you never set one",
    });
  });

  it("is uncacheable — a 410 pinned in a CDN would outlive a rollback", async () => {
    expect((await requestPost({} as any)).headers.get("Cache-Control")).toBe("no-store");
  });

  it("sets no cookie and sends no mail (it cannot: it takes no env)", async () => {
    const res = await requestPost({} as any);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("GET /api/auth/verify — retired", () => {
  it("410s rather than redirecting to a generic login error", async () => {
    // A redirect back to /login.html would read as an ordinary failed sign-in
    // and tell nobody the endpoint is gone.
    const res = await verifyGet({} as any);
    expect(res.status).toBe(410);
    expect(res.headers.get("Location")).toBeNull();
  });

  it("can never mint a session", async () => {
    const res = await verifyGet({} as any);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("the retired files cannot be revived by accident", () => {
  it.each(["functions/api/auth/request.js", "functions/api/auth/verify.js"])(
    "%s imports nothing but the json helper",
    (rel) => {
      const src = readFileSync(path.join(ROOT, rel), "utf-8");
      const imports = [...src.matchAll(/^import .*$/gm)].map((m) => m[0]);
      expect(imports).toHaveLength(1);
      expect(imports[0]).toContain("_lib.js");
      // No mail, no session minting, no user creation — the three things that
      // made this flow a problem.
      expect(src).not.toContain("magicLinkTemplate");
      expect(src).not.toContain("sessionCookie");
      expect(src).not.toContain("INSERT INTO users");
      expect(src).not.toContain("api.resend.com");
    },
  );

  it("no page under web/src/ still offers a magic-link sign-in", () => {
    // The legacy site/ directory is deliberately NOT scanned: wrangler.toml's
    // [assets] serves ./web/dist, so site/*.html is unreachable in production
    // (verified 2026-09-06). Its stale copy is left alone rather than edited
    // to imply it is live.
    const { execSync } = require("node:child_process") as typeof import("node:child_process");
    // The negative lookahead matters: /api/auth/verify-reset-code is a
    // legitimate, unrelated endpoint, and a naive "verify" match flags the
    // reset page forever.
    const out = execSync(
      `grep -rlP "api/auth/(request|verify)(?![-\\\\w])|magic-toggle|Send magic link" ${path.join(ROOT, "web", "src")} || true`,
      { encoding: "utf-8" },
    ).trim();
    expect(out).toBe("");
  });
});
