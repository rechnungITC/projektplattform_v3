/**
 * PROJ-32a — Tenant AI Provider Keys: GET / PUT / DELETE
 *
 *   GET    /api/tenants/[id]/ai-keys/[provider]
 *   PUT    /api/tenants/[id]/ai-keys/[provider]
 *   DELETE /api/tenants/[id]/ai-keys/[provider]
 *
 * The validate endpoint lives in `validate/route.ts` (POST).
 *
 * Currently only `provider=anthropic` is accepted (32b/c will widen
 * the whitelist alongside the DB CHECK constraint).
 *
 * Encryption flow:
 *   1. Bind SECRETS_ENCRYPTION_KEY env var to the session GUC via
 *      `set_session_encryption_key` (PROJ-14 RPC).
 *   2. Call `encrypt_tenant_secret(jsonb) → bytea` (PROJ-14 RPC). It
 *      returns a bytea — no side effects on tenant_secrets.
 *   3. Upsert the bytea + fingerprint + validation status into
 *      tenant_ai_keys.
 *   4. Write an audit row via `record_tenant_ai_key_audit` RPC (with
 *      old + new fingerprint).
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../_lib/route-helpers"
import {
  buildAnthropicFingerprint,
  validateAnthropicKey,
} from "@/lib/ai/anthropic-key-validator"
import {
  EncryptionUnavailableError,
  isEncryptionAvailable,
} from "@/lib/connectors/secrets"

interface Ctx {
  params: Promise<{ id: string; provider: string }>
}

const ALLOWED_PROVIDERS = ["anthropic"] as const

const putBodySchema = z.object({
  key: z
    .string()
    .min(30, "Key must be at least 30 characters.")
    .max(500, "Key is implausibly long.")
    .startsWith("sk-ant-", "Anthropic keys must start with 'sk-ant-'."),
})

type Provider = (typeof ALLOWED_PROVIDERS)[number]

function isAllowedProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p)
}

// ---------------------------------------------------------------------------
// GET — return status + fingerprint metadata. Never the encrypted_key.
// ---------------------------------------------------------------------------
export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId, provider } = await ctx.params

  if (!isAllowedProvider(provider)) {
    return apiError(
      "validation_error",
      `Unsupported provider: ${provider}.`,
      400,
      "provider",
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_ai_keys")
    .select(
      "key_fingerprint, last_validated_at, last_validation_status, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()

  if (error) return apiError("read_failed", error.message, 500)

  if (!data) {
    return NextResponse.json({
      status: "not_set",
      provider,
    })
  }

  // Map the DB validation status into the spec's UI states.
  const dbStatus = data.last_validation_status as string | null
  const uiStatus =
    dbStatus === "valid"
      ? "valid"
      : dbStatus === "invalid"
        ? "invalid"
        : dbStatus === "rate_limited"
          ? "invalid"
          : "unknown"

  return NextResponse.json({
    status: uiStatus,
    provider,
    fingerprint: data.key_fingerprint,
    last_validated_at: data.last_validated_at,
    last_validation_status: data.last_validation_status,
    created_at: data.created_at,
    updated_at: data.updated_at,
  })
}

// ---------------------------------------------------------------------------
// PUT — set or rotate the key. Test-call → encrypt → persist → audit.
// ---------------------------------------------------------------------------
export async function PUT(request: Request, ctx: Ctx) {
  const { id: tenantId, provider } = await ctx.params

  if (!isAllowedProvider(provider)) {
    return apiError(
      "validation_error",
      `Unsupported provider: ${provider}.`,
      400,
      "provider",
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = putBodySchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  if (!isEncryptionAvailable()) {
    return apiError(
      "encryption_unavailable",
      "Server is not configured for encrypted storage. " +
        "SECRETS_ENCRYPTION_KEY must be set on the server.",
      503,
    )
  }

  // Step 1: validation test-call. Reject early on 401/403 — never persist
  // an invalid key. Persist anyway on `unknown` (network/timeout) with a
  // warning, per Spec EC-1 + AC B.4.
  const validation = await validateAnthropicKey(parsed.data.key)
  if (validation.status === "invalid") {
    return apiError(
      "validation_error",
      validation.detail ?? "Anthropic rejected the key.",
      422,
      "key",
    )
  }

  // Step 2: bind encryption GUC + encrypt the key. The plain key never
  // touches a column at rest.
  const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY
  if (!encryptionKey) throw new EncryptionUnavailableError()

  const { error: gucErr } = await supabase.rpc("set_session_encryption_key", {
    p_key: encryptionKey,
  })
  if (gucErr) {
    return apiError(
      "encryption_unavailable",
      `set_session_encryption_key failed: ${gucErr.message}`,
      500,
    )
  }

  const payload = { api_key: parsed.data.key }
  const { data: encrypted, error: encErr } = await supabase.rpc(
    "encrypt_tenant_secret",
    { p_payload: payload as never },
  )
  if (encErr || !encrypted) {
    return apiError(
      "encryption_failed",
      `encrypt_tenant_secret failed: ${encErr?.message ?? "no payload"}`,
      500,
    )
  }

  const newFingerprint = buildAnthropicFingerprint(parsed.data.key)

  // Step 3: read previous fingerprint (for audit) before upsert.
  const { data: prevRow } = await supabase
    .from("tenant_ai_keys")
    .select("key_fingerprint")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()
  const oldFingerprint =
    (prevRow as { key_fingerprint?: string } | null)?.key_fingerprint ?? null
  const action = oldFingerprint ? "rotate" : "create"

  // Step 4: upsert the encrypted key + metadata.
  const { error: upErr } = await supabase
    .from("tenant_ai_keys")
    .upsert(
      {
        tenant_id: tenantId,
        provider,
        encrypted_key: encrypted as unknown as string,
        key_fingerprint: newFingerprint,
        last_validated_at:
          validation.status === "valid" ? new Date().toISOString() : null,
        last_validation_status: validation.status,
        created_by: userId,
      },
      { onConflict: "tenant_id,provider" },
    )

  if (upErr) {
    if (upErr.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin role required to set AI keys.",
        403,
      )
    }
    return apiError("upsert_failed", upErr.message, 500)
  }

  // Step 5: audit. Best-effort — failure here doesn't roll back the key
  // because the user-visible action already succeeded. Log loudly.
  const { error: auditErr } = await supabase.rpc(
    "record_tenant_ai_key_audit",
    {
      p_tenant_id: tenantId,
      p_provider: provider,
      p_action: action,
      p_old_fingerprint: oldFingerprint,
      p_new_fingerprint: newFingerprint,
    },
  )
  if (auditErr) {
    console.error(
      `[PROJ-32a] record_tenant_ai_key_audit failed for ${tenantId}/${provider}: ${auditErr.message}`,
    )
  }

  return NextResponse.json({
    status:
      validation.status === "valid"
        ? "valid"
        : validation.status === "rate_limited"
          ? "invalid"
          : "unknown",
    provider,
    fingerprint: newFingerprint,
    last_validation_status: validation.status,
    last_validated_at:
      validation.status === "valid" ? new Date().toISOString() : null,
    validation_warning:
      validation.status === "valid" ? null : validation.detail,
  })
}

// ---------------------------------------------------------------------------
// DELETE — remove the key + audit.
// ---------------------------------------------------------------------------
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: tenantId, provider } = await ctx.params

  if (!isAllowedProvider(provider)) {
    return apiError(
      "validation_error",
      `Unsupported provider: ${provider}.`,
      400,
      "provider",
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  // Read fingerprint before delete for audit trail.
  const { data: prevRow } = await supabase
    .from("tenant_ai_keys")
    .select("key_fingerprint")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()

  if (!prevRow) {
    // Nothing to delete — idempotent success.
    return NextResponse.json({ status: "not_set", provider })
  }

  const oldFingerprint = (prevRow as { key_fingerprint: string })
    .key_fingerprint

  const { error: delErr } = await supabase
    .from("tenant_ai_keys")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", provider)

  if (delErr) {
    if (delErr.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin role required to delete AI keys.",
        403,
      )
    }
    return apiError("delete_failed", delErr.message, 500)
  }

  const { error: auditErr } = await supabase.rpc(
    "record_tenant_ai_key_audit",
    {
      p_tenant_id: tenantId,
      p_provider: provider,
      p_action: "delete",
      p_old_fingerprint: oldFingerprint,
      p_new_fingerprint: null,
    },
  )
  if (auditErr) {
    console.error(
      `[PROJ-32a] record_tenant_ai_key_audit (delete) failed for ${tenantId}/${provider}: ${auditErr.message}`,
    )
  }

  return NextResponse.json({ status: "not_set", provider })
}
