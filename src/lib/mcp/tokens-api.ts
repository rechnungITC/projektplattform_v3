/**
 * PROJ-48 β — FE client wrappers for MCP token management + audit.
 *
 * fetch + safeError pattern, mirror of src/lib/jira/inbound-api.ts.
 */

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export interface McpTokenMeta {
  id: string
  label: string | null
  created_by: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  expires_at: string | null
}

/** Reveal-once result of issuing a token — token + MCP URL shown only here. */
export interface IssuedMcpToken {
  id: string
  label: string | null
  created_at: string
  expires_at: string | null
  token: string
  mcp_url: string
}

export interface McpToolCall {
  id: string
  token_id: string | null
  tool_name: string
  result_row_count: number | null
  redaction_count: number | null
  status: string
  latency_ms: number | null
  created_at: string
}

const TOKEN_BASE = "/api/connectors/mcp/tokens"
const AUDIT_BASE = "/api/connectors/mcp/audit"

export async function issueMcpToken(input: {
  label?: string
  expiresInDays?: number
}): Promise<IssuedMcpToken> {
  const body: Record<string, unknown> = {}
  if (input.label) body.label = input.label
  if (input.expiresInDays) body.expires_in_days = input.expiresInDays
  const response = await fetch(TOKEN_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as IssuedMcpToken
}

export async function listMcpTokens(): Promise<McpTokenMeta[]> {
  const response = await fetch(TOKEN_BASE, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { tokens: McpTokenMeta[] }
  return body.tokens ?? []
}

export async function revokeMcpToken(id: string): Promise<void> {
  const response = await fetch(`${TOKEN_BASE}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function listMcpToolCalls(): Promise<McpToolCall[]> {
  const response = await fetch(AUDIT_BASE, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { calls: McpToolCall[] }
  return body.calls ?? []
}
