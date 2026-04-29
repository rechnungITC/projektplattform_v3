import { NextResponse } from "next/server"

import { getDescriptor } from "@/lib/connectors/descriptors"
import { describeConnector } from "@/lib/connectors/registry"
import {
  deleteTenantSecret,
  isEncryptionAvailable,
  writeTenantSecret,
} from "@/lib/connectors/secrets"
import type { ConnectorKey } from "@/lib/connectors/types"
import { CONNECTOR_KEYS } from "@/lib/connectors/types"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../_lib/route-helpers"

// PROJ-14 — single-connector endpoints (all admin-only).
// GET    /api/connectors/[key]   → descriptor + health (no decrypted secret)
// PATCH  /api/connectors/[key]   → upsert encrypted credentials
// DELETE /api/connectors/[key]   → remove credentials

interface Ctx {
  params: Promise<{ key: string }>
}

function isKnownKey(key: string): key is ConnectorKey {
  return (CONNECTOR_KEYS as readonly string[]).includes(key)
}

async function authAdminTenant(): Promise<
  | { tenantId: string; userId: string; supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"] }
  | { error: NextResponse }
> {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const tenantId = membership?.tenant_id as string | undefined
  if (!tenantId) {
    return { error: apiError("forbidden", "No tenant membership.", 403) }
  }
  const adminDenial = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminDenial) return { error: adminDenial }

  return { tenantId, userId, supabase }
}

export async function GET(_request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isKnownKey(key)) {
    return apiError("not_found", "Unknown connector.", 404)
  }

  const auth = await authAdminTenant()
  if ("error" in auth) return auth.error

  try {
    const result = await describeConnector(auth.supabase, auth.tenantId, key)
    if (!result) return apiError("not_found", "Unknown connector.", 404)
    return NextResponse.json({
      descriptor: {
        key: result.descriptor.key,
        label: result.descriptor.label,
        summary: result.descriptor.summary,
        capability_tags: result.descriptor.capability_tags,
        credential_editable: result.descriptor.credential_editable,
      },
      status: {
        health: result.health,
        credential_source: result.credential_source,
        credential_editable: result.credential_editable,
      },
    })
  } catch (err) {
    return apiError(
      "read_failed",
      err instanceof Error ? err.message : "Unbekannter Fehler",
      500
    )
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isKnownKey(key)) {
    return apiError("not_found", "Unknown connector.", 404)
  }

  const descriptor = getDescriptor(key)
  if (!descriptor) return apiError("not_found", "Unknown connector.", 404)
  if (!descriptor.credential_editable) {
    return apiError(
      "not_editable",
      "Dieser Connector unterstützt in dieser Slice noch keine Credential-Pflege via UI.",
      409
    )
  }

  if (!isEncryptionAvailable()) {
    return apiError(
      "encryption_unavailable",
      "SECRETS_ENCRYPTION_KEY ist auf dem Server nicht gesetzt.",
      503
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = descriptor.credential_schema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid credential payload.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const auth = await authAdminTenant()
  if ("error" in auth) return auth.error

  try {
    await writeTenantSecret(auth.supabase, {
      tenantId: auth.tenantId,
      connectorKey: key,
      payload: parsed.data,
      actorUserId: auth.userId,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(
      "save_failed",
      err instanceof Error ? err.message : "Unbekannter Fehler",
      500
    )
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { key } = await ctx.params
  if (!isKnownKey(key)) {
    return apiError("not_found", "Unknown connector.", 404)
  }

  const auth = await authAdminTenant()
  if ("error" in auth) return auth.error

  try {
    await deleteTenantSecret(auth.supabase, auth.tenantId, key)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return apiError(
      "delete_failed",
      err instanceof Error ? err.message : "Unbekannter Fehler",
      500
    )
  }
}
