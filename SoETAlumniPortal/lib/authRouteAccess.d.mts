export type DashboardRole = "student" | "alumni" | "admin";

export interface RouteProfile {
  role: DashboardRole;
}

export declare function getProtectedRouteRedirect(
  pathname: string,
  profile: RouteProfile | null
): string | null;
