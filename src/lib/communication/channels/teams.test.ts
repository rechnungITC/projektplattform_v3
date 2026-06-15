/**
 * PROJ-49 — unit tests for the Teams Workflows-webhook adapter.
 * Covers: not-configured guard, happy-path POST, permanent 4xx (no retry,
 * sanitized), transient 429 retry-then-fail, URL redaction, correlation marker.
 */

import { afterEach, describe, expect, it, vi } from "vitest"

import { sanitizeTeamsError, TeamsChannel } from "./teams"
import type { DispatchInput } from "./types"

const WEBHOOK = "https://prod-1.westeurope.logic.azure.com/workflows/abc123/triggers/manual/paths/invoke?sig=SECRETSIG"

function input(over: Partial<DispatchInput> = {}): DispatchInput {
  return {
    recipient: "channel",
    subject: "Status",
    body: "Projekt läuft.",
    metadata: {},
    webhookUrl: WEBHOOK,
    correlationId: "outbox-row-1",
    ...over,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("TeamsChannel.dispatch", () => {
  it("returns not-configured (no fetch) when webhookUrl is missing", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const res = await TeamsChannel.dispatch(input({ webhookUrl: undefined }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error_detail).toContain("teams-not-configured")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("posts once and succeeds on 2xx (text payload incl. subject + correlation)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("1", { status: 200 }))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await TeamsChannel.dispatch(input())
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.stub).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.text).toContain("Status")
    expect(body.text).toContain("Projekt läuft.")
    expect(body.text).toContain("outbox-row-1")
  })

  it("fails on permanent 4xx without retry and redacts the URL", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(`bad ${WEBHOOK}`, { status: 404 }))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await TeamsChannel.dispatch(input())
    expect(res.ok).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1) // no retry on 4xx
    if (!res.ok) {
      expect(res.error_detail).toContain("HTTP 404")
      expect(res.error_detail).not.toContain("SECRETSIG")
      expect(res.error_detail).toContain("[redacted-webhook-url]")
    }
  })

  it("retries on 429 up to MAX_ATTEMPTS then fails", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response("rate", { status: 429 }))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await TeamsChannel.dispatch(input())
    expect(res.ok).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    if (!res.ok) expect(res.error_detail).toContain("nach 3 Versuchen")
  }, 10_000)

  it("retries on 5xx then succeeds if a later attempt is 2xx", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 503 }))
      .mockResolvedValueOnce(new Response("1", { status: 200 }))
    vi.stubGlobal("fetch", fetchSpy)
    const res = await TeamsChannel.dispatch(input())
    expect(res.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  }, 10_000)
})

describe("sanitizeTeamsError", () => {
  it("redacts the exact webhook URL and workflow URLs and bearer tokens", () => {
    expect(sanitizeTeamsError(`x ${WEBHOOK} y`, WEBHOOK)).not.toContain("SECRETSIG")
    expect(
      sanitizeTeamsError("https://foo.logic.azure.com/workflows/zzz/x"),
    ).toContain("[redacted-webhook-url]")
    expect(sanitizeTeamsError("auth Bearer abc.def-123 end")).toContain("Bearer [redacted]")
  })

  it("caps output length", () => {
    expect(sanitizeTeamsError("a".repeat(900)).length).toBeLessThanOrEqual(500)
  })
})
