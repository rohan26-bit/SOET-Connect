import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  // Exercise CSP only on protected Vercel preview deployments first.
  // Production and local development keep their existing response behavior.
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /csp-report",
  ].join("; ");

  // Next.js reads the request CSP nonce and attaches it to framework scripts.
  // The browser receives Report-Only, so existing pages continue to work while
  // violations are collected during preview testing.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy-Report-Only", csp);

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|location-suggestions|csp-report).*)",
  ],
};
