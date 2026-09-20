import { json } from "../_lib.js";

// RETIRED 2026-09-06 — magic-link sign-in. See sikhi.io's
// .cc/plan-auth-standardization-and-e2e-fusion.md.
//
// WHY IT HAD TO GO, on two counts:
//  1. It emailed a link on EVERY use. The standing rule across all three
//     sites is that auth mail is only a registration confirmation code and a
//     forgot-password code — never one per routine sign-in.
//  2. Worse, its partner verify.js CREATED AN ACCOUNT for any unknown
//     address. That made this an implicit registration path with no password,
//     no username and no confirmation step, reachable by anyone who could
//     type an email into the login page.
//
// The login page framed it as "for accounts that predate password auth", but
// nothing enforced that, so any current user could have been using it as
// their routine sign-in.
//
// THE LEGACY ACCOUNTS ARE NOT STRANDED. forgot-password.js's own header
// documents that it doubles as "set my first password" for users whose
// password_hash is NULL — that on-ramp is what makes this removal safe.
//
// The `magic_tokens` table is deliberately left in place and simply unwritten:
// no destructive DDL against a live database for a cleanup with no deadline.
//
// 410, not deleted, so a stale cached client gets an explicit answer rather
// than a 404 that reads as a routing bug, and so rollback is restoring a
// body rather than a file.

export async function onRequestPost() {
  return json(
    { error: "gone", use: "password sign-in; use forgot-password if you never set one" },
    410,
    { "Cache-Control": "no-store" }
  );
}
