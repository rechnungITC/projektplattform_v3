/**
 * PROJ-48 — MCP bridge endpoint (read-only, tenant-scoped).
 *
 *   POST /api/mcp   Authorization: Bearer <mcp token>   body: <JSON-RPC message>
 *
 * Stateless Streamable-HTTP / JSON mode: one JSON-RPC request per POST, one
 * response. Authentication is by hashing the bearer token against
 * mcp_access_tokens (service-role lookup — no Supabase session). Every call is
 * rate-limited per token and audited in mcp_tool_calls. Tools emit only
 * Class-1/2, `standard`-confidentiality, tenant-scoped data (see lib/mcp).
 *
 * Runs on the Node runtime (Fluid Compute) so it can reuse the TypeScript
 * data-access + classifyField() redaction layer and node:crypto.
 */

import { NextResponse } from "next/server"
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"

import { createAdminClient } from "@/lib/supabase/admin"
import { buildMcpServer } from "@/lib/mcp/server"
import { OneShotTransport } from "@/lib/mcp/transport"
import {
  digestArguments,
  extractBearerToken,
  hashMcpToken,
} from "@/lib/mcp/tokens"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RATE_WINDOW_SECONDS = Number(process.env.MCP_RATE_WINDOW_SECONDS ?? 60)
const RATE_MAX_CALLS = Number(process.env.MCP_RATE_MAX_CALLS ?? 60)

interface AuthorizeRow {
  tenant_id: string | null
  token_id: string | null
  allowed: boolean
  reason: string
}

function jsonRpcError(code: number, message: string, id: unknown = null) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } }
}

/** Pull tool name + a hashed args digest from a JSON-RPC message for audit. */
function describeCall(message: Record<string, unknown>): {
  toolName: string
  argumentsDigest: string | null
} {
  const method = typeof message.method === "string" ? message.method : "unknown"
  if (method === "tools/call") {
    const params = (message.params ?? {}) as Record<string, unknown>
    const name = typeof params.name === "string" ? params.name : "unknown"
    const digest = digestArguments(JSON.stringify(params.arguments ?? {}))
    return { toolName: `tools/call:${name}`, argumentsDigest: digest }
  }
  return { toolName: method, argumentsDigest: null }
}

export async function POST(request: Request) {
  const startedAt = Date.now()

  const rawToken = extractBearerToken(request.headers.get("authorization"))
  if (!rawToken) {
    return NextResponse.json(
      jsonRpcError(-32001, "Missing or malformed bearer token."),
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(jsonRpcError(-32700, "Parse error."), {
      status: 400,
    })
  }
  if (Array.isArray(body)) {
    return NextResponse.json(
      jsonRpcError(-32600, "Batch requests are not supported."),
      { status: 400 },
    )
  }
  if (typeof body !== "object" || body === null || !("method" in body)) {
    return NextResponse.json(jsonRpcError(-32600, "Invalid request."), {
      status: 400,
    })
  }
  const message = body as Record<string, unknown>
  const requestId = "id" in message ? message.id : null

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch {
    return NextResponse.json(
      jsonRpcError(-32603, "Server not configured.", requestId),
      { status: 500 },
    )
  }

  // ── authorize + rate-limit (atomic in DB) ──────────────────────────────────
  const { data: authData, error: authError } = await supabase.rpc(
    "mcp_authorize_call",
    {
      p_token_hash: hashMcpToken(rawToken),
      p_window_seconds: RATE_WINDOW_SECONDS,
      p_max_calls: RATE_MAX_CALLS,
    },
  )
  if (authError) {
    return NextResponse.json(
      jsonRpcError(-32603, "Authorization failed.", requestId),
      { status: 500 },
    )
  }
  const auth = (Array.isArray(authData) ? authData[0] : authData) as
    | AuthorizeRow
    | undefined

  if (!auth || !auth.allowed) {
    const reason = auth?.reason ?? "invalid_token"
    if (reason === "rate_limited" && auth?.tenant_id) {
      const { toolName, argumentsDigest } = describeCall(message)
      await supabase.from("mcp_tool_calls").insert({
        tenant_id: auth.tenant_id,
        token_id: auth.token_id,
        tool_name: toolName,
        arguments_digest: argumentsDigest,
        status: "rate_limited",
        latency_ms: Date.now() - startedAt,
      })
      return NextResponse.json(
        jsonRpcError(-32002, "Rate limit exceeded.", requestId),
        { status: 429 },
      )
    }
    return NextResponse.json(
      jsonRpcError(-32001, "Unauthorized.", requestId),
      { status: 401 },
    )
  }

  // ── dispatch the single JSON-RPC message through a fresh tenant server ──────
  const tenantId = auth.tenant_id as string
  const { server, stats } = buildMcpServer({ tenantId, supabase })
  const transport = new OneShotTransport()

  let response: JSONRPCMessage | null = null
  let dispatchStatus: "ok" | "error" = "ok"
  try {
    await server.connect(transport)
    response = await transport.handle(message as unknown as JSONRPCMessage)
    if (response && "error" in response) dispatchStatus = "error"
  } catch {
    dispatchStatus = "error"
    response = jsonRpcError(-32603, "Internal error.", requestId) as JSONRPCMessage
  } finally {
    await server.close().catch(() => {})
  }

  // ── audit ───────────────────────────────────────────────────────────────────
  const { toolName, argumentsDigest } = describeCall(message)
  await supabase.from("mcp_tool_calls").insert({
    tenant_id: tenantId,
    token_id: auth.token_id,
    tool_name: toolName,
    arguments_digest: argumentsDigest,
    result_row_count: stats.rowCount,
    redaction_count: stats.redactionCount,
    status: dispatchStatus,
    latency_ms: Date.now() - startedAt,
  })

  // A notification (no id) yields no response body — ack with 202.
  if (response === null) {
    return new NextResponse(null, { status: 202 })
  }
  return NextResponse.json(response, { status: 200 })
}
