import { describe, it, expect } from "vitest";
import { safeLoginReturn, universitySigninHref } from "../web/src/lib/login-links";

describe("Google family sign-in handoff", () => {
  it("returns through the existing university receiver with query and hash intact", () => {
    const destination = "/course/intro?lesson=2&language=pa#progress";
    const signin = new URL(universitySigninHref("https://sikhiuni.com", destination, true));
    expect(signin.origin).toBe("https://sikhi.io");
    expect(signin.pathname).toBe("/signin");
    expect(signin.searchParams.get("provider")).toBe("google");
    const next = signin.searchParams.get("next")!;
    expect(next.startsWith("/api/sso/issue?")).toBe(true);
    const issuer = new URL(next, signin.origin);
    const receiver = new URL(issuer.searchParams.get("return")!);
    expect(receiver.origin).toBe("https://sikhiuni.com");
    expect(receiver.pathname).toBe("/api/auth/sso");
    expect(receiver.searchParams.get("return")).toBe(destination);
  });
  it("keeps the normal SSO button as a direct existing-session handoff", () => {
    const href = new URL(universitySigninHref("https://sikhiuni.com", "/dashboard"));
    expect(href.pathname).toBe("/api/sso/issue");
    expect(href.searchParams.has("provider")).toBe(false);
  });
  it.each([null, "", "https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/%5cevil.test", "/%0a/evil.test", "/	/evil.test", "/%zz"])("rejects unsafe destination %s", (input) => {
    expect(safeLoginReturn(input, "/dashboard")).toBe("/dashboard");
  });
  it("retains legitimate Unicode learning paths", () => {
    expect(safeLoginReturn("/learn/ਪੰਜਾਬੀ?unit=3")).toBe("/learn/ਪੰਜਾਬੀ?unit=3");
  });
});
