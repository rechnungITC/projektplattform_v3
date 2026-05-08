import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs"

const SECURITY_HEADERS = [
  // Clickjacking — site cannot be embedded in iframes
  { key: "X-Frame-Options", value: "DENY" },
  // MIME-sniffing — browsers stick to declared Content-Type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer leakage — full URL on same-origin, origin only cross-origin
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  // Force HTTPS — 1 year, includes subdomains
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // Limit powerful APIs not used by the app
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP in report-only mode: surfaces violations in the browser console without
  // blocking. After a clean observation window on prod traffic (see
  // docs/production/deployment-runbook.md Phase 7), flip the header name to
  // `Content-Security-Policy` to enforce. No report-uri — DevTools console only.
  //
  // 'unsafe-inline' is required by Next.js for hydration + theme bootstrap
  // inline scripts. 'unsafe-eval' has been removed — Next.js production
  // bundles do not require eval; if the report shows violations during the
  // observation window, re-add temporarily.
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
]

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/projects/[id]/snapshots": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
    "/api/projects/[id]/snapshots/[sid]/render-pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

// Sentry wrapper is a no-op without NEXT_PUBLIC_SENTRY_DSN / SENTRY_AUTH_TOKEN.
// `silent: true` suppresses build noise when those env vars are absent.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
})
