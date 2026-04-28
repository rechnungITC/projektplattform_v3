import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"

// Temporary verification endpoint — confirms Sentry receives events from the
// server runtime in production. Remove after first confirmed event in the
// Sentry dashboard. Public on purpose: no auth, so curl from CI works.
export const dynamic = "force-dynamic"

export async function GET() {
  const eventId = Sentry.captureMessage(
    "V3 deploy verification — server-side Sentry test event",
    "info"
  )
  await Sentry.flush(2000)
  return NextResponse.json({
    ok: true,
    eventId: eventId ?? null,
    note: "Check Sentry dashboard — event should appear within ~30s.",
  })
}
