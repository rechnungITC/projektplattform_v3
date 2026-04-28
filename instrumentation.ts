// Next.js calls this on each runtime startup. Sentry needs the runtime-specific
// init to fire here so server/edge spans are captured from the first request.
// Each config file is a no-op when NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN is unset.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs"
