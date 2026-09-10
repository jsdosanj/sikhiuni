import { describe, it, expect } from "vitest";
import { onRequestGet as usersGet } from "../functions/api/admin/users.js";
import { onRequestGet as statsGet } from "../functions/api/admin/stats.js";
import { onRequestGet as applicationsGet } from "../functions/api/admin/applications.js";
import { mockEnv, req, LEARNER, ADMIN } from "./helpers";

// INVARIANT 5: admin endpoints must reject anonymous and non-admin callers.
//
// NOTE: these handlers gate on the joined user row's `role` column
// (`user.role !== "admin"`), NOT on isAdminEmail/ADMIN_EMAILS. So the security
// boundary here is the DB role, and an "admin user" for these routes is one
// whose users.role === "admin". We assert that CURRENT behavior. ADMIN_EMAILS is
// what promotes an account to the admin role at login time (elsewhere), not what
// these routes check.
const ADMIN_ENDPOINTS: Array<[string, (a: any) => Promise<Response>]> = [
  ["admin/users GET", usersGet as any],
  ["admin/stats GET", statsGet as any],
  ["admin/applications GET", applicationsGet as any],
];

describe.each(ADMIN_ENDPOINTS)("%s — authz", (_name, handler) => {
  // These handlers were switched from an inline getUser()+role check (which
  // conflated "not signed in" and "signed in but not admin" into one 403) to the
  // shared requireMfa()/requireRole() helper, which distinguishes them: 401 for no
  // session, 403 for a session that's the wrong role or hasn't cleared MFA yet.
  it("anonymous (no session) → 401", async () => {
    const res = await handler({
      request: req({ url: "http://localhost/api/admin" }),
      env: mockEnv({ adminEmails: "admin@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("non-admin learner → 403", async () => {
    const res = await handler({
      request: req({ url: "http://localhost/api/admin", cookie: "sess-learner" }),
      env: mockEnv({ user: LEARNER, adminEmails: "admin@example.com" }),
    });
    expect(res.status).toBe(403);
  });

  it("admin user, not MFA-enrolled → allowed (enrollment is no longer a block)", async () => {
    const res = await handler({
      request: req({ url: "http://localhost/api/admin", cookie: "sess-admin" }),
      env: mockEnv({ user: { ...ADMIN, mfa_ok: 1 }, adminEmails: "admin@example.com", rows: [] }),
    });
    expect(res.status).toBe(200);
  });

  it("admin user, MFA-enrolled but session not verified this login → 403", async () => {
    const res = await handler({
      request: req({ url: "http://localhost/api/admin", cookie: "sess-admin" }),
      env: mockEnv({ user: { ...ADMIN, mfa_ok: 0 }, adminEmails: "admin@example.com", rows: [], mfaEnrolled: true }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("mfa_required");
  });

  it("admin user, MFA-enrolled and session verified → not 403 (200)", async () => {
    const res = await handler({
      request: req({ url: "http://localhost/api/admin", cookie: "sess-admin" }),
      env: mockEnv({ user: { ...ADMIN, mfa_ok: 1 }, adminEmails: "admin@example.com", rows: [], mfaEnrolled: true }),
    });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
  });
});
