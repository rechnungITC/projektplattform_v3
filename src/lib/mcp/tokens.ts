/**
 * PROJ-48 — MCP access-token helpers.
 *
 * Tokens are 32 random bytes (hex). Only the sha256 hash is ever persisted or
 * looked up; the raw token is shown exactly once at issue time. Mirrors the
 * PROJ-50 jira webhook-token discipline, kept connector-local so the MCP
 * bridge does not couple to the Jira adapter.
 */

import { createHash, randomBytes } from "crypto"

/** Human-recognisable prefix so a leaked token is identifiable in logs/tooling. */
export const MCP_TOKEN_PREFIX = "mcp_"

/** Generate a fresh raw MCP token (shown once, never stored). */
export function generateMcpToken(): string {
  return `${MCP_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`
}

/** sha256 hex of a raw token — only the hash is persisted/looked up (64 chars). */
export function hashMcpToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex")
}

/**
 * Extract a bearer token from an Authorization header.
 * Returns null when the header is missing or not a Bearer scheme.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  return match ? match[1].trim() : null
}

/** sha256 hex digest of an arbitrary string — used for arguments_digest audit. */
export function digestArguments(serialized: string): string {
  return createHash("sha256").update(serialized, "utf8").digest("hex")
}
