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
  // Limit powerful APIs; microphone stays same-origin for Assistant push-to-talk.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
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
  /*
   * PROJ-Y-143d: hide the Next dev-tools indicator for visual-regression runs.
   *
   * The indicator is a permanently mounted dev-only control in the bottom-left
   * corner. It was sitting in *every* authenticated baseline — dark circle when
   * idle, wide "Compiling …" pill while Turbopack works — so the images froze
   * tooling chrome, and its two shapes differ between runs. At ~0.4% of a
   * 1280x720 frame it stays under `maxDiffPixelRatio: 0.02`, which is why no
   * test ever complained.
   *
   * It cannot be removed from the test side: it lives in a *closed* shadow
   * root, so it is unreachable for CSS (`nextjs-portal { display: none }` was
   * tried), for `mask`, and for a text wait — all three verified empirically.
   * Turning it off in config is the only supported route.
   *
   * Env-gated on purpose: `npm run dev` by a human is unaffected; only the
   * Playwright-managed server sets the flag (see `playwright.config.ts`).
   * Caveat: with `reuseExistingServer` a dev server already started by hand
   * is reused as-is and will still show the indicator.
   */
  ...(process.env.PW_DISABLE_DEV_INDICATOR === "1"
    ? { devIndicators: false as const }
    : {}),
  outputFileTracingIncludes: {
    "/api/projects/*/snapshots": ["node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/projects/*/snapshots/*/render-pdf": [
      "node_modules/@sparticuz/chromium/bin/**/*",
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
