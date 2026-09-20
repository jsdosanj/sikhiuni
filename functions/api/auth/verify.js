import { json } from "../_lib.js";

// RETIRED 2026-09-06 — the consume half of magic-link sign-in. See
// functions/api/auth/request.js's header for the full reasoning, and
// sikhi.io's .cc/plan-auth-standardization-and-e2e-fusion.md.
//
// This route was the more serious of the pair: it did not merely sign in an
// existing user, it CREATED AN ACCOUNT for any email that presented a valid
// token — an implicit registration path with no password, no username and no
// confirmation step. Registration is now the explicit two-step
// /api/auth/register-start -> /api/auth/register-complete.
//
// Any magic token still in flight when this deploys will land here and get a
// 410 instead of a session. That window is at most 15 minutes (the token TTL),
// and the affected user's remedy is the ordinary password sign-in or, if they
// never set one, forgot-password — which doubles as "set my first password".
//
// The `magic_tokens` table and its rows are left untouched: no destructive DDL
// against a live database for a cleanup with no deadline.
//
// GET is answered with a 410 body rather than a redirect on purpose. A
// redirect back to /login.html would look like an ordinary failed sign-in and
// tell nobody — a human or a monitor hitting this deserves to see that the
// endpoint is gone, not that their link was invalid.

export async function onRequestGet() {
  return json(
    { error: "gone", use: "password sign-in; use forgot-password if you never set one" },
    410,
    { "Cache-Control": "no-store" }
  );
}
