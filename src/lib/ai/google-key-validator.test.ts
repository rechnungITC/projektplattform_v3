import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildGoogleFingerprint,
  validateGoogleKey,
} from "./google-key-validator"

describe("validateGoogleKey", () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("200 → valid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    const r = await validateGoogleKey("AIzaTestKey1234567890")
    expect(r.status).toBe("valid")
  })

  it("400 (Google's typical bad-key response) → invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 400 } as Response)
    const r = await validateGoogleKey("AIza-bad")
    expect(r.status).toBe("invalid")
  })

  it("401 → invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
    expect((await validateGoogleKey("AIza-bad")).status).toBe("invalid")
  })

  it("403 → invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
    expect((await validateGoogleKey("AIza-bad")).status).toBe("invalid")
  })

  it("429 → rate_limited", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
    expect((await validateGoogleKey("AIza-throttle")).status).toBe(
      "rate_limited",
    )
  })

  it("500 → unknown", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    expect((await validateGoogleKey("AIza-temp")).status).toBe("unknown")
  })

  it("uses x-goog-api-key header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    globalThis.fetch = fetchMock
    await validateGoogleKey("AIzaTest123456")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "AIzaTest123456",
    )
  })

  it("hits /v1beta/models endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    globalThis.fetch = fetchMock
    await validateGoogleKey("AIzaTest123456")
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models",
    )
  })
})

describe("buildGoogleFingerprint", () => {
  it("returns AIza...XYZ with last 4 chars", () => {
    expect(buildGoogleFingerprint("AIzaSyAbCdEfGhWXYZ")).toBe("AIza...WXYZ")
  })
  it("falls back for too-short input", () => {
    expect(buildGoogleFingerprint("AI")).toBe("AIza...****")
  })
})
