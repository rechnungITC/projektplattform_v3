import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildAnthropicFingerprint,
  validateAnthropicKey,
} from "./anthropic-key-validator"

describe("validateAnthropicKey", () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  function mockFetchOnce(
    response: Partial<Response> & { status: number; ok?: boolean },
  ) {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: response.ok ?? (response.status >= 200 && response.status < 300),
      status: response.status,
    } as Response)
  }

  it("200 OK → valid", async () => {
    mockFetchOnce({ status: 200, ok: true })
    const r = await validateAnthropicKey("sk-ant-abc...test")
    expect(r.status).toBe("valid")
    expect(r.http_status).toBe(200)
    expect(r.detail).toBeNull()
  })

  it("401 → invalid", async () => {
    mockFetchOnce({ status: 401, ok: false })
    const r = await validateAnthropicKey("sk-ant-bad")
    expect(r.status).toBe("invalid")
    expect(r.http_status).toBe(401)
  })

  it("403 → invalid", async () => {
    mockFetchOnce({ status: 403, ok: false })
    const r = await validateAnthropicKey("sk-ant-bad")
    expect(r.status).toBe("invalid")
  })

  it("429 → rate_limited", async () => {
    mockFetchOnce({ status: 429, ok: false })
    const r = await validateAnthropicKey("sk-ant-throttled")
    expect(r.status).toBe("rate_limited")
  })

  it("500 → unknown", async () => {
    mockFetchOnce({ status: 503, ok: false })
    const r = await validateAnthropicKey("sk-ant-temp")
    expect(r.status).toBe("unknown")
    expect(r.http_status).toBe(503)
  })

  it("network error → unknown", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const r = await validateAnthropicKey("sk-ant-anywhere")
    expect(r.status).toBe("unknown")
    expect(r.http_status).toBeNull()
    expect(r.detail).toContain("ECONNREFUSED")
  })

  it("AbortError → unknown with timeout detail", async () => {
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr)
    const r = await validateAnthropicKey("sk-ant-slow")
    expect(r.status).toBe("unknown")
    expect(r.detail).toContain("timed out")
  })

  it("sends x-api-key + anthropic-version headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response)
    globalThis.fetch = fetchMock

    await validateAnthropicKey("sk-ant-key-test-1234")

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers["x-api-key"]).toBe("sk-ant-key-test-1234")
    expect(init.headers["anthropic-version"]).toBe("2023-06-01")
    expect(init.method).toBe("GET")
  })
})

describe("buildAnthropicFingerprint", () => {
  it("returns last 4 chars prefixed with sk-ant-...", () => {
    expect(buildAnthropicFingerprint("sk-ant-api03-abcdef-XYZW")).toBe(
      "sk-ant-...XYZW",
    )
  })

  it("strips whitespace", () => {
    expect(buildAnthropicFingerprint("  sk-ant-test-1234  ")).toBe(
      "sk-ant-...1234",
    )
  })

  it("falls back to placeholder for too-short input", () => {
    expect(buildAnthropicFingerprint("short")).toBe("sk-ant-...****")
  })

  it("never includes more than the last 4 chars", () => {
    const fp = buildAnthropicFingerprint("sk-ant-very-long-key-do-not-reveal")
    expect(fp).not.toContain("very")
    expect(fp).not.toContain("long")
    expect(fp).not.toContain("not-reveal")
    expect(fp).toBe("sk-ant-...veal")
  })
})
