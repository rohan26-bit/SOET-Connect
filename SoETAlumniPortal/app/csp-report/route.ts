import { NextRequest, NextResponse } from "next/server";

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 10;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeOrigin(value: unknown, baseUrl: string): string | null {
  if (typeof value !== "string" || !value || value === "inline" || value === "eval") {
    return typeof value === "string" && value ? value.slice(0, 40) : null;
  }
  try {
    return new URL(value, baseUrl).origin;
  } catch {
    return null;
  }
}

function summarize(report: Record<string, unknown>, baseUrl: string) {
  const nested = asRecord(report["csp-report"]) || asRecord(report.body) || report;
  const documentUri = nested["document-uri"] ?? nested.documentURL;
  let documentPath: string | null = null;
  if (typeof documentUri === "string") {
    try {
      documentPath = new URL(documentUri, baseUrl).pathname.slice(0, 160);
    } catch {
      documentPath = null;
    }
  }

  return {
    disposition: String(nested.disposition || "report").slice(0, 20),
    directive: String(nested["effective-directive"] || nested.effectiveDirective || nested["violated-directive"] || "unknown").slice(0, 100),
    blockedOrigin: safeOrigin(nested["blocked-uri"] ?? nested.blockedURL, baseUrl),
    sourceOrigin: safeOrigin(nested["source-file"] ?? nested.sourceFile, baseUrl),
    documentPath,
    line: Number.isInteger(nested["line-number"]) ? nested["line-number"] : null,
  };
}

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const reports = Array.isArray(payload) ? payload : [payload];
  for (const item of reports.slice(0, MAX_REPORTS_PER_REQUEST)) {
    const record = asRecord(item);
    if (record) {
      // Avoid logging full URLs, query strings, cookies, or arbitrary report bodies.
      console.info("[csp-report]", JSON.stringify(summarize(record, request.url)));
    }
  }

  return new NextResponse(null, { status: 204 });
}
