/**
 * PROJ-48 — MCP access-token management (tenant-admin only).
 *
 *   POST   /api/connectors/mcp/tokens   body: { label?, expires_in_days? }
 *     → issue a token. Returns the RAW token + MCP endpoint URL ONCE; only the
 *       sha256 hash is persisted. Re-issue to rotate.
 *   GET    /api/connectors/mcp/tokens
 *     → list token metadata (no hash, no raw token), newest first.
 *   DELETE /api/connectors/mcp/tokens?id=…
 *     → revoke a token (sets revoked_at; the MCP route then 401s it).
 *
 * Active tenant is resolved server-side from the caller's membership (mirrors
 * GET /api/connectors). The raw token is the bridge credential — shown exactly
 * once, never logged or returned again.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "@/app/api/_lib/route-helpers"
import { generateMcpToken, hashMcpToken } from "@/lib/mcp/tokens"

const postSchema = z.object({
  label: z.string().trim().max(120).optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
})

function mcpUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return `${base}/api/mcp`
}

async function resolveAdminTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ tenantId: string } | { error: ReturnType<typeof apiError> }> {
  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const tenantId = membership?.tenant_id as string | undefined
  if (!tenantId) return { error: apiError("forbidden", "No tenant membership.", 403) }
  const denial = await requireTenantAdmin(supabase, tenantId, userId)
  if (denial) return { error: denial }
  return { tenantId }
}

export async function POST(request: Request) {
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = postSchema.safeParse(
    typeof body === "object" && body !== null ? body : {},
  )
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const resolved = await resolveAdminTenant(supabase, userId)
  if ("error" in resolved) return resolved.error

  const rawToken = generateMcpToken()
  const tokenHash = hashMcpToken(rawToken)
  const expiresAt = parsed.data.expires_in_days
    ? new Date(Date.now() + parsed.data.expires_in_days * 86_400_000).toISOString()
    : null

  const { data, error } = await supabase
    .from("mcp_access_tokens")
    .insert({
      tenant_id: resolved.tenantId,
      token_hash: tokenHash,
      label: parsed.data.label ?? null,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select("id, label, created_at, expires_at")
    .single()

  if (error) return apiError("insert_failed", error.message, 500)

  return NextResponse.json(
    {
      id: (data as { id: string }).id,
      label: (data as { label: string | null }).label,
      created_at: (data as { created_at: string }).created_at,
      expires_at: (data as { expires_at: string | null }).expires_at,
      // Shown ONCE — store it now, it cannot be retrieved later.
      token: rawToken,
      mcp_url: mcpUrl(),
    },
    { status: 201 },
  )
}

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const resolved = await resolveAdminTenant(supabase, userId)
  if ("error" in resolved) return resolved.error

  const { data, error } = await supabase
    .from("mcp_access_tokens")
    .select("id, label, created_by, created_at, last_used_at, revoked_at, expires_at")
    .eq("tenant_id", resolved.tenantId)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) return apiError("read_failed", error.message, 500)
  return NextResponse.json({ tokens: data ?? [] }, { status: 200 })
}

export async function DELETE(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get("id") ?? ""
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const resolved = await resolveAdminTenant(supabase, userId)
  if ("error" in resolved) return resolved.error

  const { error } = await supabase
    .from("mcp_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", resolved.tenantId)
    .is("revoked_at", null)

  if (error) return apiError("update_failed", error.message, 500)
  return NextResponse.json({ ok: true }, { status: 200 })
}
