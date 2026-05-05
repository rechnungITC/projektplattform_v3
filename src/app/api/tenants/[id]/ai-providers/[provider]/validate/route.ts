/**
 * PROJ-32-c-β — Tenant AI Providers: re-validate (POST).
 *
 *   POST /api/tenants/[id]/ai-providers/[provider]/validate
 *
 * Re-runs the test-call against the stored config without changing it.
 * Used by the "Re-Test" button in the admin UI.
 */

import { NextResponse } from "next/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../../_lib/route-helpers"
import { validateAnthropicKey } from "@/lib/ai/anthropic-key-validator"
import { validateGoogleKey } from "@/lib/ai/google-key-validator"
import { validateOllamaConfig } from "@/lib/ai/ollama-config-validator"
import { validateOpenAIKey } from "@/lib/ai/openai-key-validator"
import { isEncryptionAvailable } from "@/lib/connectors/secrets"

interface Ctx {
  params: Promise<{ id: string; provider: string }>
}

const ALLOWED_PROVIDERS = [
  "anthropic",
  "ollama",
  "openai",
  "google",
] as const

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

  // Verify the row exists first so we can return a meaningful 404.
  const { data: row, error: readErr } = await supabase
    .from("tenant_ai_providers")
    .select("key_fingerprint")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()
  if (readErr) return apiError("read_failed", readErr.message, 500)
  if (!row)
    return apiError("not_found", "No AI provider configured.", 404)

  // Bind GUC + decrypt the JSONB config.
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

  const { data: configRaw, error: decErr } = await supabase.rpc(
    "decrypt_tenant_ai_provider",
    {
      p_tenant_id: tenantId,
      p_provider: provider,
    },
  )
  if (decErr || !configRaw) {
    return apiError(
      "decrypt_failed",
      `decrypt_tenant_ai_provider failed: ${decErr?.message ?? "no config returned"}`,
      500,
    )
  }
  const config = configRaw as Record<string, unknown>

  // Run the provider-specific validation.
  let validationStatus: string
  let validationDetail: string | null = null

  if (provider === "anthropic") {
    const apiKey = config.api_key
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return apiError(
        "decrypt_failed",
        "Decrypted Anthropic config is missing api_key.",
        500,
      )
    }
    const validation = await validateAnthropicKey(apiKey)
    validationStatus = validation.status
    validationDetail = validation.detail
  } else if (provider === "openai") {
    const apiKey = config.api_key
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return apiError(
        "decrypt_failed",
        "Decrypted OpenAI config is missing api_key.",
        500,
      )
    }
    const validation = await validateOpenAIKey(apiKey)
    validationStatus = validation.status
    validationDetail = validation.detail
  } else if (provider === "google") {
    const apiKey = config.api_key
    if (typeof apiKey !== "string" || apiKey.length === 0) {
      return apiError(
        "decrypt_failed",
        "Decrypted Google config is missing api_key.",
        500,
      )
    }
    const validation = await validateGoogleKey(apiKey)
    validationStatus = validation.status
    validationDetail = validation.detail
  } else {
    // ollama
    const endpoint = config.endpoint_url
    const model = config.model_id
    const bearer = config.bearer_token
    if (typeof endpoint !== "string" || typeof model !== "string") {
      return apiError(
        "decrypt_failed",
        "Decrypted Ollama config is missing endpoint_url or model_id.",
        500,
      )
    }
    const validation = await validateOllamaConfig({
      endpointUrl: endpoint,
      modelId: model,
      bearerToken: typeof bearer === "string" ? bearer : null,
    })
    validationStatus = validation.status
    validationDetail = validation.detail
  }

  const newValidatedAt =
    validationStatus === "valid" ? new Date().toISOString() : null

  const { error: upErr } = await supabase
    .from("tenant_ai_providers")
    .update({
      last_validated_at: newValidatedAt,
      last_validation_status: validationStatus,
    })
    .eq("tenant_id", tenantId)
    .eq("provider", provider)

  if (upErr) return apiError("update_failed", upErr.message, 500)

  // Audit the validation attempt.
  const fp = (row as { key_fingerprint: string }).key_fingerprint
  const { error: auditErr } = await supabase.rpc(
    "record_tenant_ai_provider_audit",
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
      `[PROJ-32-c-β] record_tenant_ai_provider_audit (validate) failed for ${tenantId}/${provider}: ${auditErr.message}`,
    )
  }

  return NextResponse.json({
    status:
      validationStatus === "valid"
        ? "valid"
        : validationStatus === "invalid" || validationStatus === "rate_limited"
          ? "invalid"
          : validationStatus === "unreachable"
            ? "unreachable"
            : validationStatus === "model_missing"
              ? "model_missing"
              : "unknown",
    provider,
    fingerprint: fp,
    last_validation_status: validationStatus,
    last_validated_at: newValidatedAt,
    validation_detail: validationDetail,
  })
}
