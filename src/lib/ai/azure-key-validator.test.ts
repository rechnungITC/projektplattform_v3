/**
 * PROJ-92 — Azure config validator tests (fetch mocked).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildAzureChatUrl,
  buildAzureFingerprint,
  sanitizeAzureEndpoint,
  validateAzureConfig,
} from "./azure-key-validator"

const INPUT = {
  endpoint: "https://res.openai.azure.com",
  deployment: "gpt-4o",
  apiKey: "az-secret",
  apiVersion: "2024-10-21",
}

describe("PROJ-92 — sanitizeAzureEndpoint", () => {
  it("accepts https and strips path/trailing slash", () => {
    expect(sanitizeAzureEndpoint("https://res.openai.azure.com/")).toEqual({
      ok: true,
      normalized: "https://res.openai.azure.com",
    })
    expect(sanitizeAzureEndpoint("https://res.openai.azure.com/openai")).toEqual(
      { ok: true, normalized: "https://res.openai.azure.com" },
    )
  })
  it("rejects http and garbage", () => {
    expect(sanitizeAzureEndpoint("http://res.openai.azure.com").ok).toBe(false)
    expect(sanitizeAzureEndpoint("not-a-url").ok).toBe(false)
  })
})

describe("PROJ-92 — buildAzureChatUrl", () => {
  it("builds the deployment chat-completions URL with api-version", () => {
    expect(buildAzureChatUrl(INPUT.endpoint, "gpt-4o", "2024-10-21")).toBe(
      "https://res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21",
    )
  })
})

describe("PROJ-92 — buildAzureFingerprint", () => {
  it("uses host + deployment, never the key", () => {
    expect(buildAzureFingerprint(INPUT.endpoint, "gpt-4o")).toBe(
      "res.openai.azure.com/gpt-4o",
    )
  })
})

describe("PROJ-92 — validateAzureConfig", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("200 → valid", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 })
    expect((await validateAzureConfig(INPUT)).status).toBe("valid")
  })
  it("401 → invalid", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    expect((await validateAzureConfig(INPUT)).status).toBe("invalid")
  })
  it("404 → model_missing (deployment not found)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    expect((await validateAzureConfig(INPUT)).status).toBe("model_missing")
  })
  it("400 mentioning api-version → invalid with hint", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Unsupported api-version",
    })
    const r = await validateAzureConfig(INPUT)
    expect(r.status).toBe("invalid")
    expect(r.detail).toMatch(/api-version/i)
  })
  it("429 → rate_limited", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 })
    expect((await validateAzureConfig(INPUT)).status).toBe("rate_limited")
  })
  it("network error → unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))
    expect((await validateAzureConfig(INPUT)).status).toBe("unreachable")
  })
})
