/**
 * PROJ-48 — MCP token helpers.
 */
import { describe, expect, it } from "vitest"

import {
  MCP_TOKEN_PREFIX,
  digestArguments,
  extractBearerToken,
  generateMcpToken,
  hashMcpToken,
} from "./tokens"

describe("generateMcpToken", () => {
  it("emits a prefixed 64-hex-char token and is unique per call", () => {
    const a = generateMcpToken()
    const b = generateMcpToken()
    expect(a.startsWith(MCP_TOKEN_PREFIX)).toBe(true)
    expect(a.slice(MCP_TOKEN_PREFIX.length)).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe("hashMcpToken", () => {
  it("is deterministic and produces a 64-char sha256 hex (DB CHECK)", () => {
    const raw = "mcp_test"
    expect(hashMcpToken(raw)).toBe(hashMcpToken(raw))
    expect(hashMcpToken(raw)).toMatch(/^[0-9a-f]{64}$/)
  })

  it("differs for different inputs", () => {
    expect(hashMcpToken("a")).not.toBe(hashMcpToken("b"))
  })
})

describe("extractBearerToken", () => {
  it("parses a Bearer header (case-insensitive)", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123")
    expect(extractBearerToken("bearer  xyz ")).toBe("xyz")
  })
  it("returns null for missing or non-bearer headers", () => {
    expect(extractBearerToken(null)).toBeNull()
    expect(extractBearerToken("Basic abc")).toBeNull()
    expect(extractBearerToken("")).toBeNull()
  })
})

describe("digestArguments", () => {
  it("hashes serialized args to 64-char hex (never raw values)", () => {
    const d = digestArguments(JSON.stringify({ project_id: "p1" }))
    expect(d).toMatch(/^[0-9a-f]{64}$/)
    expect(d).not.toContain("p1")
  })
})
