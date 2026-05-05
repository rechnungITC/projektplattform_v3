import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildOpenAIFingerprint,
  validateOpenAIKey,
} from "./openai-key-validator"

describe("validateOpenAIKey", () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it("200 → valid", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response)
    const r = await validateOpenAIKey("sk-test-1234567890123456789012")
    expect(r.status).toBe("valid")
  })

  it("401 → invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 } as Response)
    const r = await validateOpenAIKey("sk-bad")
    expect(r.status).toBe("invalid")
  })

  it("403 → invalid", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
    const r = await validateOpenAIKey("sk-bad")
    expect(r.status).toBe("invalid")
  })

  it("429 → rate_limited", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
    const r = await validateOpenAIKey("sk-throttled")
    expect(r.status).toBe("rate_limited")
  })

  it("500 → unknown", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    const r = await validateOpenAIKey("sk-temp")
    expect(r.status).toBe("unknown")
  })

  it("network error → unknown", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const r = await validateOpenAIKey("sk-anywhere")
    expect(r.status).toBe("unknown")
  })

  it("AbortError → unknown timeout", async () => {
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr)
    const r = await validateOpenAIKey("sk-slow")
    expect(r.status).toBe("unknown")
    expect(r.detail).toContain("timed out")
  })

  it("uses Authorization Bearer header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    globalThis.fetch = fetchMock
    await validateOpenAIKey("sk-test-12345678901234567890")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test-12345678901234567890",
    )
  })

  it("hits /v1/models endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    globalThis.fetch = fetchMock
    await validateOpenAIKey("sk-test-12345678901234567890")
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models")
  })
})

describe("buildOpenAIFingerprint", () => {
  it("returns sk-...XYZ with last 4 chars", () => {
    expect(buildOpenAIFingerprint("sk-proj-abcdefXYZW")).toBe("sk-...XYZW")
  })
  it("falls back for too-short input", () => {
    expect(buildOpenAIFingerprint("sk-")).toBe("sk-...****")
  })
})
