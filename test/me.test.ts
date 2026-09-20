// /api/me: isTeacher must reflect either role==='teacher' OR an actual course_teachers
// assignment held by a user of any other role (course_teachers is independent of
// users.role — see functions/api/_lib.js's isCourseTeacher).
import { describe, it, expect } from "vitest";
import { onRequestGet, onRequestPost } from "../functions/api/me.js";
import { mockEnv, req, LEARNER, TEACHER, ADMIN } from "./helpers";

const call = (env: any, request: any) => onRequestGet({ request, env });
const post = (env: any, request: any) => onRequestPost({ request, env });

describe("GET /api/me isTeacher", () => {
  it("anonymous -> { user: null }", async () => {
    const res = await call(mockEnv({ user: null }), req({ url: "http://x/api/me" }));
    expect((await res.json()).user).toBeNull();
  });

  it("plain learner with no course_teachers row -> isTeacher false", async () => {
    const res = await call(mockEnv({ user: LEARNER, ownsCourse: false }), req({ url: "http://x/api/me", cookie: "s" }));
    expect((await res.json()).user.isTeacher).toBe(false);
  });

  it("role==='teacher' -> isTeacher true even with no course_teachers row yet", async () => {
    const res = await call(mockEnv({ user: TEACHER, ownsCourse: false }), req({ url: "http://x/api/me", cookie: "s" }));
    expect((await res.json()).user.isTeacher).toBe(true);
  });

  it("learner-role user WITH a course_teachers assignment -> isTeacher true", async () => {
    const res = await call(mockEnv({ user: LEARNER, ownsCourse: true }), req({ url: "http://x/api/me", cookie: "s" }));
    expect((await res.json()).user.isTeacher).toBe(true);
  });

  it("admin with no course_teachers assignment -> isTeacher false (admin-ness alone isn't teacher-ness)", async () => {
    const res = await call(mockEnv({ user: ADMIN, ownsCourse: false }), req({ url: "http://x/api/me", cookie: "s" }));
    expect((await res.json()).user.isTeacher).toBe(false);
  });

  it("admin also assigned as a course teacher -> isTeacher true", async () => {
    const res = await call(mockEnv({ user: ADMIN, ownsCourse: true }), req({ url: "http://x/api/me", cookie: "s" }));
    expect((await res.json()).user.isTeacher).toBe(true);
  });

  it("marketingOptin defaults false when the DB column is 0/absent", async () => {
    const res = await call(mockEnv({ user: LEARNER }), req({ url: "http://x/api/me", cookie: "s" }));
    expect((await res.json()).user.marketingOptin).toBe(false);
  });

  it("marketingOptin reflects a truthy DB value", async () => {
    const res = await call(
      mockEnv({ user: { ...LEARNER, marketing_optin: 1 } }),
      req({ url: "http://x/api/me", cookie: "s" })
    );
    expect((await res.json()).user.marketingOptin).toBe(true);
  });
});

describe("POST /api/me marketingOptin", () => {
  it("anonymous -> 401", async () => {
    const res = await post(mockEnv({ user: null }), req({ url: "http://x/api/me", body: { marketingOptin: true } }));
    expect(res.status).toBe(401);
  });

  it("omitting the key entirely leaves the existing opt-in value untouched", async () => {
    const res = await post(
      mockEnv({ user: { ...LEARNER, marketing_optin: 1 } }),
      req({ url: "http://x/api/me", cookie: "s", body: { name: "Learner" } })
    );
    expect((await res.json()).user.marketingOptin).toBe(true);
  });

  it("sending marketingOptin:true turns it on", async () => {
    const res = await post(
      mockEnv({ user: { ...LEARNER, marketing_optin: 0 } }),
      req({ url: "http://x/api/me", cookie: "s", body: { marketingOptin: true } })
    );
    expect((await res.json()).user.marketingOptin).toBe(true);
  });

  it("sending marketingOptin:false turns it off", async () => {
    const res = await post(
      mockEnv({ user: { ...LEARNER, marketing_optin: 1 } }),
      req({ url: "http://x/api/me", cookie: "s", body: { marketingOptin: false } })
    );
    expect((await res.json()).user.marketingOptin).toBe(false);
  });
});
