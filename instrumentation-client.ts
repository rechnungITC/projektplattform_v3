import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  })
}

// Required by @sentry/nextjs to instrument client-side App Router transitions.
// No-op when Sentry isn't initialized.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
