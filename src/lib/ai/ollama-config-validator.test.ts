import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildOllamaFingerprint,
  sanitizeOllamaUrl,
  validateOllamaConfig,
} from "./ollama-config-validator"

describe("sanitizeOllamaUrl", () => {
  it("accepts an https URL", () => {
    const r = sanitizeOllamaUrl("https://ollama.acme.com")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe("https://ollama.acme.com")
      expect(r.insecure).toBe(false)
    }
  })

  it("accepts an http URL with insecure=true flag", () => {
    const r = sanitizeOllamaUrl("http://ollama.internal:11434")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe("http://ollama.internal:11434")
      expect(r.insecure).toBe(true)
    }
  })

  it("strips trailing slashes", () => {
    const r = sanitizeOllamaUrl("https://ollama.acme.com///")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.normalized).toBe("https://ollama.acme.com")
  })

  it("rejects empty input", () => {
    const r = sanitizeOllamaUrl("")
    expect(r.ok).toBe(false)
  })

  it("rejects URLs longer than 500 chars", () => {
    const r = sanitizeOllamaUrl("https://x.com/" + "a".repeat(490))
    expect(r.ok).toBe(false)
  })

  it("rejects file:// scheme (SSRF)", () => {
    const r = sanitizeOllamaUrl("file:///etc/passwd")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/scheme/i)
  })

  it("rejects javascript: scheme (SSRF)", () => {
    const r = sanitizeOllamaUrl("javascript:alert(1)")
    expect(r.ok).toBe(false)
  })

  it("rejects 169.254.169.254 (cloud metadata)", () => {
    const r = sanitizeOllamaUrl("http://169.254.169.254/latest/meta-data/")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/cloud-metadata/i)
  })

  it("rejects any 169.254.x.x range", () => {
    const r = sanitizeOllamaUrl("http://169.254.42.5:8080")
    expect(r.ok).toBe(false)
  })

  it("rejects malformed URL", () => {
    const r = sanitizeOllamaUrl("not a url")
    expect(r.ok).toBe(false)
  })
})

describe("validateOllamaConfig", () => {
  let originalFetch: typeof fetch
  beforeEach(() => {
    originalFetch = globalThis.fetch
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it("200 + matching model → valid", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: "llama3.1:70b" }, { name: "mistral:7b" }],
      }),
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "llama3.1:70b",
    })
    expect(r.status).toBe("valid")
  })

  it("200 + missing model → model_missing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: "mistral:7b" }] }),
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "llama3.1:70b",
    })
    expect(r.status).toBe("model_missing")
    expect(r.detail).toContain("llama3.1:70b")
    expect(r.detail).toContain("ollama pull")
  })

  it("401 → invalid (auth failed)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
      bearerToken: "bad-token",
    })
    expect(r.status).toBe("invalid")
  })

  it("403 → invalid", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("invalid")
  })

  it("429 → rate_limited", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("rate_limited")
  })

  it("500 → unknown", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("unknown")
  })

  it("connection refused → unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"))
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("unreachable")
    expect(r.detail).toContain("ECONNREFUSED")
  })

  it("AbortError → unreachable with timeout detail", async () => {
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    globalThis.fetch = vi.fn().mockRejectedValueOnce(abortErr)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("unreachable")
    expect(r.detail).toContain("timed out")
  })

  it("malformed JSON body → unknown", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json")
      },
    } as unknown as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("unknown")
  })

  it("response missing 'models' array → unknown", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: "shape" }),
    } as Response)
    const r = await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    expect(r.status).toBe("unknown")
  })

  it("sends Authorization header when bearer token present", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: "x:1" }] }),
    } as Response)
    globalThis.fetch = fetchMock
    await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
      bearerToken: "my-token-1234",
    })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer my-token-1234",
    )
  })

  it("does NOT send Authorization header when bearer is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: "x:1" }] }),
    } as Response)
    globalThis.fetch = fetchMock
    await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it("queries the /api/tags path on the endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: "x:1" }] }),
    } as Response)
    globalThis.fetch = fetchMock
    await validateOllamaConfig({
      endpointUrl: "https://ollama.acme.com",
      modelId: "x:1",
    })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toBe("https://ollama.acme.com/api/tags")
  })
})

describe("buildOllamaFingerprint", () => {
  it("returns ollama:host/model for a normal URL", () => {
    expect(
      buildOllamaFingerprint("https://ollama.acme.com", "llama3.1:70b"),
    ).toBe("ollama:ollama.acme.com/llama3.1:70b")
  })

  it("includes the port if present", () => {
    expect(
      buildOllamaFingerprint("http://10.0.0.5:11434", "qwen:7b"),
    ).toBe("ollama:10.0.0.5:11434/qwen:7b")
  })

  it("falls back to model-only when URL is unparseable", () => {
    expect(buildOllamaFingerprint("not-a-url", "qwen:7b")).toBe(
      "ollama:qwen:7b",
    )
  })
})
