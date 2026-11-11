const DASHBOARD_ROLES = new Set(["student", "alumni", "admin"]);

function matchesRoute(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Returns the route a user should be sent to when they open a dashboard route
 * they are not allowed to access. Returns null when the route is public or the
 * user's role is allowed.
 *
 * @param {string} pathname
 * @param {{ role: string } | null} profile
 * @returns {string | null}
 */
export function getProtectedRouteRedirect(pathname, profile) {
  const isStudentRoute = matchesRoute(pathname, "/student");
  const isAlumniRoute = matchesRoute(pathname, "/alumni");
  const isAdminRoute = matchesRoute(pathname, "/admin");
  const isAccountRoute = matchesRoute(pathname, "/account");
  const isProtectedRoute =
    isStudentRoute || isAlumniRoute || isAdminRoute || isAccountRoute;

  if (!isProtectedRoute) return null;
  if (!profile || !DASHBOARD_ROLES.has(profile.role)) return "/login";

  if (isAdminRoute && profile.role !== "admin") {
    return profile.role === "alumni" ? "/alumni" : "/student";
  }

  if (isAlumniRoute && profile.role !== "alumni" && profile.role !== "admin") {
    return "/student";
  }

  if (isStudentRoute && profile.role !== "student") {
    return profile.role === "alumni" ? "/alumni" : "/admin";
  }

  return null;
}
