import type { NextConfig } from "next"

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
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig
