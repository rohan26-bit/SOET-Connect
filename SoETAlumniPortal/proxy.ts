import { NextRequest, NextResponse } from "next/server";

/**
 * Preview-only CSP canary.
 *
 * Production remains on its existing security headers until the report-only
 * rollout is clean across the public routes and authenticated user journeys.
 */
export function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /csp-report",
  ].join("; ");

  // Next.js reads the request CSP and x-nonce headers to nonce framework
  // scripts and supported inline resources during request rendering.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy-Report-Only", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|location-suggestions|csp-report).*)",
  ],
};
