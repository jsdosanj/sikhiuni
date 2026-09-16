// Cross-site handoff links for the "sikhi.io family" tile row on the
// dashboard. Ported from sikhi.io's lib/auth/ssoLinks.ts — keep the contract
// identical across the three repos.
//
// WHY A MODULE AND NOT INLINE STRINGS: the `return` parameter handed to the
// issuer is itself a URL carrying its OWN nested `?return=` query param, so it
// needs a real encodeURIComponent. Interpolating it by hand is exactly the
// kind of thing that silently produces a link which 302s to an error page and
// nobody notices for a month. Being a module also makes the hrefs directly
// assertable in test/family-links.test.ts.
//
// WHY EVERY HOP GOES THROUGH sikhi.io (hub-and-spoke): the SSO receivers on
// this site and punjabiuni.com hard-enforce `iss === "sikhi.io"` on purpose.
// A tile here pointing at punjabiuni therefore cannot mint its own token — it
// asks the hub to mint one. Making this site an issuer too would triple the
// token-minting surface to save one redirect hop, which is a bad trade.
//
// The contract (Finding F5 of sikhi.io's
// .cc/plan-sso-receiver-punjabiuni-sikhiuni.md): the `return` given to
// /api/sso/issue must be the DESTINATION site's own consumer-route URL,
// itself carrying its nested same-origin return path. The issuer's allowlist
// checks only the OUTER url's origin, so a consumer path with its own query
// string passes fine.

const HUB = "https://sikhi.io";

export function ssoHandoffHref(consumerUrl: string): string {
  return `${HUB}/api/sso/issue?return=${encodeURIComponent(consumerUrl)}`;
}

/** sikhi.io is the hub — a plain link, no token needed to reach its own site. */
export const SIKHI_IO_HREF = `${HUB}/dashboard`;

// 2026-09-16 fix: punjabiuni.com's real dashboard lives at /dashboard, not
// its bare homepage -- this used to return to "/", landing a signed-in
// visitor on the marketing page instead. Matches the same fix made in
// sikhi.io's own lib/auth/ssoLinks.ts and punjabiuni's own copy already
// correctly targets /dashboard.html on this site and /dashboard on sikhi.io.
export const PUNJABIUNI_SSO = ssoHandoffHref("https://punjabiuni.com/api/auth/sso?return=/dashboard");

export type FamilyTile = {
  id: string;
  name: string;
  href: string;
  blurb: string;
  /** Shown as the tile's small print. "same login" is the whole promise. */
  note: string;
};

export const FAMILY_TILES: FamilyTile[] = [
  {
    id: "sikhi-io",
    name: "sikhi.io",
    href: SIKHI_IO_HREF,
    blurb: "The archive — Gurbani, exegesis, the library, kirtan and seva.",
    note: "same login",
  },
  {
    id: "punjabiuni",
    name: "PunjabiUni",
    href: PUNJABIUNI_SSO,
    blurb: "Learn to read, write and speak Punjabi, from the alphabet up.",
    note: "same login",
  },
];

// The one shared line of copy across all three dashboards. Reused verbatim
// from sikhi.io's Super Dashboard so the family reads as one thing.
export const FAMILY_BLURB =
  "One identity across sikhi.io, punjabiuni.com and sikhiuni.com — your bookmarks, seva and reading carry over everywhere.";
