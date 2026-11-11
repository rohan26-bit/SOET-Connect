import test from "node:test";
import assert from "node:assert/strict";
import { getProtectedRouteRedirect } from "../lib/authRouteAccess.mjs";

test("anonymous visitors are sent to login for each protected dashboard area", () => {
  for (const path of ["/student", "/student/profile", "/alumni", "/alumni/achievements", "/admin", "/admin/students", "/account/sessions"]) {
    assert.equal(getProtectedRouteRedirect(path, null), "/login", path);
  }
});

test("student accounts stay in the student area", () => {
  const student = { role: "student" };
  assert.equal(getProtectedRouteRedirect("/student", student), null);
  assert.equal(getProtectedRouteRedirect("/student/profile", student), null);
  assert.equal(getProtectedRouteRedirect("/alumni", student), "/student");
  assert.equal(getProtectedRouteRedirect("/admin", student), "/student");
});

test("alumni accounts are redirected away from student and admin dashboards", () => {
  const alumni = { role: "alumni" };
  assert.equal(getProtectedRouteRedirect("/alumni", alumni), null);
  assert.equal(getProtectedRouteRedirect("/alumni/achievements", alumni), null);
  assert.equal(getProtectedRouteRedirect("/student", alumni), "/alumni");
  assert.equal(getProtectedRouteRedirect("/admin/students", alumni), "/alumni");
});

test("admin accounts are redirected away from the student dashboard", () => {
  const admin = { role: "admin" };
  assert.equal(getProtectedRouteRedirect("/admin", admin), null);
  assert.equal(getProtectedRouteRedirect("/student", admin), "/admin");
  // Admin access to alumni pages remains allowed by the existing product rule.
  assert.equal(getProtectedRouteRedirect("/alumni", admin), null);
});

test("any authenticated role can use the shared account sessions area", () => {
  for (const role of ["student", "alumni", "admin"]) {
    assert.equal(getProtectedRouteRedirect("/account/sessions", { role }), null);
  }
});

test("public routes and similarly-prefixed unrelated routes are not protected", () => {
  for (const path of ["/", "/login", "/register/student", "/forgot-password", "/studentish", "/administer", "/accounting"]) {
    assert.equal(getProtectedRouteRedirect(path, null), null, path);
  }
});

test("unknown profile roles fail closed on protected routes", () => {
  assert.equal(getProtectedRouteRedirect("/student", { role: "guest" }), "/login");
});
