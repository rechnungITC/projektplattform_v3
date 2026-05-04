/**
 * PROJ-32a — Tenant AI Provider Key: re-validate (POST).
 *
 *   POST /api/tenants/[id]/ai-keys/[provider]/validate
 *
 * Re-runs the test-call against the stored key without changing the
 * key itself. Updates `last_validated_at` + `last_validation_status`.
 * Used by the "Re-Test" button in the admin UI.
 *
 * The plain key is decrypted server-side (admin-only path: we use
 * `decrypt_tenant_ai_key` here too, which gates on tenant_member —
 * an admin always satisfies that).
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../../_lib/route-helpers"
import { validateAnthropicKey } from "@/lib/ai/anthropic-key-validator"
import { isEncryptionAvailable } from "@/lib/connectors/secrets"

interface Ctx {
  params: Promise<{ id: string; provider: string }>
}

const ALLOWED_PROVIDERS = ["anthropic"] as const

export async function POST(_request: Request, ctx: Ctx) {
  const { id: tenantId, provider } = await ctx.params

  if (!(ALLOWED_PROVIDERS as readonly string[]).includes(provider)) {
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

  if (!isEncryptionAvailable()) {
    return apiError(
      "encryption_unavailable",
      "Server is not configured for encrypted storage.",
      503,
    )
  }

  // Verify a row exists first so we can return a meaningful 404.
  const { data: row, error: readErr } = await supabase
    .from("tenant_ai_keys")
    .select("key_fingerprint")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()
  if (readErr) return apiError("read_failed", readErr.message, 500)
  if (!row) return apiError("not_found", "No AI key set for this provider.", 404)

  // Bind GUC + decrypt.
  const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY
  if (!encryptionKey) {
    return apiError(
      "encryption_unavailable",
      "SECRETS_ENCRYPTION_KEY missing.",
      503,
    )
  }
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

  const { data: plainKey, error: decErr } = await supabase.rpc(
    "decrypt_tenant_ai_key",
    {
      p_tenant_id: tenantId,
      p_provider: provider,
    },
  )
  if (decErr || !plainKey) {
    return apiError(
      "decrypt_failed",
      `decrypt_tenant_ai_key failed: ${decErr?.message ?? "no key returned"}`,
      500,
    )
  }

  const validation = await validateAnthropicKey(plainKey as string)

  const newValidatedAt =
    validation.status === "valid" ? new Date().toISOString() : null

  const { error: upErr } = await supabase
    .from("tenant_ai_keys")
    .update({
      last_validated_at: newValidatedAt,
      last_validation_status: validation.status,
    })
    .eq("tenant_id", tenantId)
    .eq("provider", provider)

  if (upErr) {
    return apiError("update_failed", upErr.message, 500)
  }

  // Audit the validation attempt — useful trail for "did the key actually
  // work yesterday?" questions.
  const fp = (row as { key_fingerprint: string }).key_fingerprint
  const { error: auditErr } = await supabase.rpc(
    "record_tenant_ai_key_audit",
    {
      p_tenant_id: tenantId,
      p_provider: provider,
      p_action: "validate",
      p_old_fingerprint: fp,
      p_new_fingerprint: fp,
    },
  )
  if (auditErr) {
    console.error(
      `[PROJ-32a] record_tenant_ai_key_audit (validate) failed for ${tenantId}/${provider}: ${auditErr.message}`,
    )
  }

  return NextResponse.json({
    status:
      validation.status === "valid"
        ? "valid"
        : validation.status === "invalid" ||
            validation.status === "rate_limited"
          ? "invalid"
          : "unknown",
    provider,
    fingerprint: fp,
    last_validation_status: validation.status,
    last_validated_at: newValidatedAt,
    validation_detail: validation.detail,
  })
}
