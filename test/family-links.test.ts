// Pins the cross-site handoff hrefs rendered by the dashboard's "sikhi.io
// family" tile row (web/src/lib/family-links.ts).
//
// These are byte-exact assertions on purpose. The punjabiuni link's `return`
// parameter is itself a URL carrying its OWN nested `?return=`, so it needs a
// real encodeURIComponent; get that wrong and the tile silently 302s to an
// error page that nobody notices for a month. A rendered link is also the one
// part of this feature no unit test of the handlers would ever catch.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ssoHandoffHref, SIKHI_IO_HREF, PUNJABIUNI_SSO, FAMILY_TILES, FAMILY_BLURB,
} from "../web/src/lib/family-links";

describe("family-links hrefs", () => {
  it("sikhi.io is a PLAIN link — the hub needs no token to reach itself", () => {
    expect(SIKHI_IO_HREF).toBe("https://sikhi.io/dashboard");
    expect(SIKHI_IO_HREF).not.toContain("sso");
  });

  it("punjabiuni is hub-routed with a properly encoded nested return", () => {
    expect(PUNJABIUNI_SSO).toBe(
      "https://sikhi.io/api/sso/issue?return=https%3A%2F%2Fpunjabiuni.com%2Fapi%2Fauth%2Fsso%3Freturn%3D%2Fdashboard",
    );
  });

  it("the nested return survives a real URL round-trip", () => {
    // The property that actually matters: the issuer must be able to read the
    // destination back out intact, including its own query string.
    const url = new URL(PUNJABIUNI_SSO);
    const ret = url.searchParams.get("return")!;
    expect(ret).toBe("https://punjabiuni.com/api/auth/sso?return=/dashboard");
    expect(new URL(ret).origin).toBe("https://punjabiuni.com"); // what the issuer allowlists
    expect(new URL(ret).searchParams.get("return")).toBe("/dashboard");
  });

  it("encodes a return path with its own query string without losing it", () => {
    const href = ssoHandoffHref("https://sikhiuni.com/api/auth/sso?return=/dashboard.html");
    const ret = new URL(href).searchParams.get("return")!;
    expect(ret).toBe("https://sikhiuni.com/api/auth/sso?return=/dashboard.html");
  });

  it("every hop is minted by the hub — this site is never an issuer", () => {
    // The receivers hard-enforce iss === "sikhi.io"; a tile that tried to mint
    // its own token would simply be rejected, and adding an issuer here would
    // triple the token-minting surface to save one redirect.
    for (const tile of FAMILY_TILES) {
      if (tile.href.includes("/api/sso/issue")) {
        expect(new URL(tile.href).origin).toBe("https://sikhi.io");
      }
    }
  });

  it("no tile points back at this site — a self-link is not navigation", () => {
    for (const tile of FAMILY_TILES) {
      expect(new URL(tile.href, "https://sikhiuni.com").host).not.toBe("sikhiuni.com");
    }
  });

  it("every tile has real copy and a unique id", () => {
    expect(FAMILY_TILES.length).toBeGreaterThan(0);
    const ids = FAMILY_TILES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of FAMILY_TILES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
      expect(t.note).toBe("same login");
    }
  });

  it("shares the hub dashboard's exact family wording", () => {
    // Same sentence on all three dashboards, so the family reads as one thing.
    // If this changes, change sikhi.io's pages/dashboard.tsx and punjabiuni's
    // dashboard in the same breath.
    expect(FAMILY_BLURB).toBe(
      "One identity across sikhi.io, punjabiuni.com and sikhiuni.com — your bookmarks, seva and reading carry over everywhere.",
    );
  });
});

describe("the dashboard actually renders the row", () => {
  const src = readFileSync(path.resolve(__dirname, "..", "web", "src", "pages", "dashboard.astro"), "utf-8");

  it("imports the shared module rather than interpolating hrefs by hand", () => {
    expect(src).toContain("from '../lib/family-links'");
    expect(src).not.toContain("api/sso/issue?return="); // no hand-built link
  });

  it("carries the testid the E2E suite selects on", () => {
    expect(src).toContain('data-testid="family-tiles"');
  });

  it("renders the row OUTSIDE #dash, which the account script wipes wholesale", () => {
    // #dash's innerHTML is replaced by the script on load; a tile row inside
    // it would vanish the moment the page finished loading.
    const dashOpen = src.indexOf('<div id="dash">');
    const tiles = src.indexOf('data-testid="family-tiles"');
    expect(dashOpen).toBeGreaterThan(-1);
    expect(tiles).toBeGreaterThan(dashOpen);
    // Track nested divs: any earlier closing div alone does not prove that
    // the replaceable account container has closed before the family row.
    let depth = 0;
    let dashEnd = -1;
    for (const tag of src.slice(dashOpen).matchAll(/<\/?div\b[^>]*>/g)) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { dashEnd = dashOpen + tag.index! + tag[0].length; break; }
    }
    expect(dashEnd).toBeGreaterThan(dashOpen);
    expect(dashEnd).toBeLessThan(tiles);
    // The outer dashboard section is still open, despite nested focus sections.
    const sections = src.slice(0, tiles).match(/<\/?section\b[^>]*>/g) || [];
    expect(sections.reduce((n, tag) => n + (tag.startsWith('</') ? -1 : 1), 0)).toBe(1);
  });
});
