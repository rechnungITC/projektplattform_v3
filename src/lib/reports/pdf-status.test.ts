import { describe, expect, it } from "vitest"

import {
  isPdfPendingStale,
  normalizePdfStatus,
  STALE_PDF_PENDING_MS,
} from "./pdf-status"

describe("pdf status helpers", () => {
  it("keeps fresh pending snapshots pending", () => {
    const now = Date.parse("2026-05-07T10:00:00.000Z")
    const generatedAt = new Date(now - STALE_PDF_PENDING_MS + 1_000).toISOString()

    expect(isPdfPendingStale(generatedAt, now)).toBe(false)
    expect(normalizePdfStatus("pending", generatedAt, now)).toBe("pending")
  })

  it("normalizes stale pending snapshots to failed", () => {
    const now = Date.parse("2026-05-07T10:00:00.000Z")
    const generatedAt = new Date(now - STALE_PDF_PENDING_MS - 1_000).toISOString()

    expect(isPdfPendingStale(generatedAt, now)).toBe(true)
    expect(normalizePdfStatus("pending", generatedAt, now)).toBe("failed")
  })

  it("does not alter terminal pdf states", () => {
    const now = Date.parse("2026-05-07T10:00:00.000Z")
    const generatedAt = new Date(now - STALE_PDF_PENDING_MS - 1_000).toISOString()

    expect(normalizePdfStatus("available", generatedAt, now)).toBe("available")
    expect(normalizePdfStatus("failed", generatedAt, now)).toBe("failed")
  })
})
