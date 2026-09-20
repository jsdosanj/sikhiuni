import { json } from "../_lib.js";

// RETIRED 2026-09-06 — see sikhi.io's
// .cc/plan-auth-standardization-and-e2e-fusion.md.
//
// This route was instant email+password signup: no username, and no email
// confirmation at all. It is replaced by the two-step
// /api/auth/register-start -> /api/auth/register-complete, which emails a
// 6-digit code and only creates the account once that code has been proven
// from the same browser that requested it.
//
// Kept as an explicit 410 rather than deleted so a stale cached client gets a
// clear answer instead of a 404 that reads as a routing bug, and so the
// rollback is re-pointing the UI at a file that still exists.

export async function onRequestPost() {
  return json(
    { error: "gone", use: "/api/auth/register-start" },
    410,
    { "Cache-Control": "no-store" }
  );
}
