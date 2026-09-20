// Pins functions/_email-templates.js.
//
// The load-bearing assertion is the cross-site one: sikhi.io, sikhiuni.com and
// punjabiuni.com each render an identically-worded "Powered by sikhi.io" mark
// in every template. There is deliberately no shared npm package for that
// snippet (three repos, three deploy pipelines -- a package would be more
// drift surface than a pinned string), so these tests ARE the anti-drift
// mechanism. Change the wording here and you must change it in sikhi.io's
// __tests__/email-templates.test.ts and punjabiuni's
// lib/email/templates.test.ts in the same breath.
import { describe, it, expect } from "vitest";
import { resetCodeTemplate, welcomeTemplate, registrationCodeTemplate, POWERED_BY_HTML } from "../functions/_email-templates.js";

const ALL: Array<[string, { subject: string; html: string; text: string }]> = [
  ["resetCode", resetCodeTemplate("482913")],
  ["welcome (named)", welcomeTemplate("Harjit")],
  ["welcome (anonymous)", welcomeTemplate()],
  ["registrationCode (named)", registrationCodeTemplate("482913", "harjit")],
  ["registrationCode (anonymous)", registrationCodeTemplate("482913")],
];

describe.each(ALL)("template %s", (_name, t) => {
  it("carries the canonical cross-site powered-by mark", () => {
    expect(t.html).toContain("Powered by ");
    expect(t.html).toContain("https://sikhi.io");
  });

  it("has a subject and a non-empty plaintext alternative", () => {
    expect(t.subject.length).toBeGreaterThan(0);
    expect(t.text.trim().length).toBeGreaterThan(0);
  });

  it("keeps the email-client conventions these templates depend on", () => {
    // Table layout announced as presentation, a hidden preheader, and the
    // mso/apple meta tags that stop Outlook and iOS Mail reflowing the card.
    expect(t.html).toContain('role="presentation"');
    expect(t.html).toContain("mso-hide:all");
    expect(t.html).toContain('http-equiv="X-UA-Compatible"');
    expect(t.html).toContain("x-apple-disable-message-reformatting");
    // bgcolor beside every background-color: Outlook drops the CSS.
    expect(t.html).toContain('bgcolor="#0b1e3a"');
    // Inline styles only — a <style> block is stripped by Gmail/Outlook, so
    // its presence would mean part of the design silently doesn't render.
    expect(t.html).not.toContain("<style");
  });

  it("stays on the Sikhi University palette, not a sibling site's", () => {
    expect(t.html).toContain("#f4b21a"); // saffron rule
    expect(t.html).toContain("Sikhi University");
  });
});

describe("POWERED_BY_HTML", () => {
  it("is the exact canonical row, in this site's two colour slots", () => {
    expect(POWERED_BY_HTML).toContain("Powered by ");
    expect(POWERED_BY_HTML).toContain('href="https://sikhi.io"');
    expect(POWERED_BY_HTML).toContain("#5f7396"); // muted
    expect(POWERED_BY_HTML).toContain("#ffc83d"); // accent
  });
});

describe("welcomeTemplate", () => {
  it("CTAs to the dashboard", () => {
    expect(welcomeTemplate().html).toContain("dashboard.html");
    expect(welcomeTemplate().text).toContain("https://sikhiuni.com/dashboard.html");
  });

  it("greets by name when known, and degrades cleanly when not", () => {
    expect(welcomeTemplate("Harjit").html).toContain("welcome, Harjit");
    const anon = welcomeTemplate().html;
    expect(anon).toContain("Waheguru Ji Ka Khalsa");
    expect(anon).not.toContain("welcome, ");
    // null is what the DB actually holds for a nameless account — it must
    // behave like undefined, not print "welcome, null".
    expect(welcomeTemplate(null as unknown as string).html).not.toContain("null");
  });

  it("says why it was sent — it is transactional, not marketing", () => {
    expect(welcomeTemplate().html).toContain("an account was created for you");
  });

  it("names the three real things the account does", () => {
    const html = welcomeTemplate().html;
    expect(html).toContain("departments catalogue");
    expect(html).toContain("certificates");
    expect(html).toContain("Learning paths");
  });
});

// 2026-09-06: magicLinkTemplate was DELETED along with the magic-link flow
// (functions/api/auth/{request,verify}.js are 410s). registrationCodeTemplate
// replaced it as the newest template, and unlike the one it succeeds it is a
// CODE email, not a link email — a link is a bearer credential that signs in
// whatever device opens the mail.
describe("registrationCodeTemplate — the single email a new native account receives", () => {
  const t = registrationCodeTemplate("482913", "harjit");

  it("shows the code in the html, the plaintext and the subject", () => {
    expect(t.html).toContain("482913");
    expect(t.text).toContain("482913");
    expect(t.subject.startsWith("482913")).toBe(true); // readable from a notification
  });

  it("is a CODE email — the only links are the powered-by mark", () => {
    const hrefs = [...t.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h === "https://sikhi.io")).toBe(true);
  });

  it("states the 15-minute expiry and the same-tab constraint", () => {
    expect(t.html).toContain("15 minutes");
    expect(t.html).toContain("same tab");
    expect(t.text).toContain("15 minutes");
  });

  it("carries the welcome copy it absorbed, so the fusion didn't lose value", () => {
    expect(t.html).toContain("departments catalogue");
    expect(t.html).toContain("certificates");
    expect(t.html).toContain("Learning paths");
    expect(t.text).toContain("departments catalogue");
  });

  it("greets by username when known and degrades cleanly when not", () => {
    expect(t.html).toContain("welcome, harjit");
    expect(registrationCodeTemplate("482913").html).not.toContain("welcome,");
  });

  it("says nothing was created if the reader ignores it", () => {
    expect(t.html).toContain("nothing has been created");
    expect(t.text).toContain("nothing has been created");
  });

  it("is branded, not the unbranded markup the old flow started with", () => {
    expect(t.html).toContain("Sikhi University");
    expect(t.html).toContain("&#9772;"); // the crest glyph
  });
});

// 2026-09-06: the reset converged from a clickable link onto a 6-digit code
// bound to the requesting browser, matching sikhi.io and punjabiuni.com. The
// old link-based resetPasswordTemplate and its grace-window branch were
// removed 2026-09-07.
describe("resetCodeTemplate — the live forgot-password email", () => {
  const t = resetCodeTemplate("482913");

  it("shows the code in the html, the plaintext and the subject", () => {
    expect(t.html).toContain("482913");
    expect(t.text).toContain("482913");
    expect(t.subject.startsWith("482913")).toBe(true);
  });

  it("is a CODE email, not a link email — the only href is the powered-by mark", () => {
    // A reset link signs in whatever device opens the mail and is a standalone
    // bearer credential. Regression guard against "improving" this back into
    // a button.
    const hrefs = [...t.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h === "https://sikhi.io")).toBe(true);
  });

  it("states the 15-minute expiry and the same-tab constraint", () => {
    expect(t.html).toContain("15 minutes");
    expect(t.html).toContain("same tab");
    expect(t.text).toContain("15 minutes");
  });

  it("reassures a reader who didn't ask for it", () => {
    expect(t.html).toContain("current password remains unchanged");
    expect(t.text).toContain("current password remains unchanged");
  });
});
