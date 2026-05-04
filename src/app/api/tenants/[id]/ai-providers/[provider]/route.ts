/**
 * PROJ-32-c-β — Tenant AI Providers: per-provider GET/PUT/DELETE.
 *
 *   GET    /api/tenants/[id]/ai-providers/[provider]
 *   PUT    /api/tenants/[id]/ai-providers/[provider]   (Zod-validated body shape)
 *   DELETE /api/tenants/[id]/ai-providers/[provider]
 *
 * Hard-Cutover from 32a /ai-keys/[provider] (Fork G.3 lock):
 *   * The shape of the request body is now provider-discriminated:
 *     - anthropic: { key: "sk-ant-..." }
 *     - ollama:    { endpoint_url, model_id, bearer_token? }
 *   * Encrypted storage uses the new tenant_ai_providers table.
 *   * Audit RPC is the new record_tenant_ai_provider_audit.
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
  buildOllamaFingerprint,
  sanitizeOllamaUrl,
  validateOllamaConfig,
} from "@/lib/ai/ollama-config-validator"
import {
  EncryptionUnavailableError,
  isEncryptionAvailable,
} from "@/lib/connectors/secrets"

interface Ctx {
  params: Promise<{ id: string; provider: string }>
}

const ALLOWED_PROVIDERS = ["anthropic", "ollama"] as const
type Provider = (typeof ALLOWED_PROVIDERS)[number]

function isAllowedProvider(p: string): p is Provider {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(p)
}

// ---------------------------------------------------------------------------
// Discriminated PUT body schemas
// ---------------------------------------------------------------------------

const anthropicPutSchema = z.object({
  key: z
    .string()
    .min(30, "Key must be at least 30 characters.")
    .max(500, "Key is implausibly long.")
    .startsWith("sk-ant-", "Anthropic keys must start with 'sk-ant-'."),
})

const ollamaPutSchema = z.object({
  endpoint_url: z
    .string()
    .min(1, "endpoint_url is required.")
    .max(500, "endpoint_url is implausibly long."),
  model_id: z
    .string()
    .min(1, "model_id is required.")
    .max(100, "model_id is implausibly long.")
    .refine((v) => v === v.trim(), "model_id must not have leading/trailing whitespace."),
  bearer_token: z
    .string()
    .min(8, "bearer_token must be at least 8 characters.")
    .max(500, "bearer_token is implausibly long.")
    .optional(),
})

// ---------------------------------------------------------------------------
// GET — return status + fingerprint metadata. Never the encrypted_config.
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
    .from("tenant_ai_providers")
    .select(
      "key_fingerprint, last_validated_at, last_validation_status, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()

  if (error) return apiError("read_failed", error.message, 500)

  if (!data) {
    return NextResponse.json({ status: "not_set", provider })
  }

  // Map DB validation status into a UI status. The new schema has 6 possible
  // states; the UI cares about the user-facing distinction (valid / invalid /
  // unknown / unreachable / model_missing).
  const dbStatus = data.last_validation_status as string | null
  const uiStatus =
    dbStatus === "valid"
      ? "valid"
      : dbStatus === "invalid" || dbStatus === "rate_limited"
        ? "invalid"
        : dbStatus === "unreachable"
          ? "unreachable"
          : dbStatus === "model_missing"
            ? "model_missing"
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
// PUT — set or rotate a provider config. Test-call → encrypt → persist → audit.
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

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  if (!isEncryptionAvailable()) {
    return apiError(
      "encryption_unavailable",
      "Server is not configured for encrypted storage. SECRETS_ENCRYPTION_KEY must be set on the server.",
      503,
    )
  }

  // Provider-specific validation + JSONB build.
  let configJsonb: Record<string, unknown>
  let fingerprint: string
  let validationStatus: string
  let validationDetail: string | null = null

  if (provider === "anthropic") {
    const parsed = anthropicPutSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return apiError(
        "validation_error",
        first?.message ?? "Invalid request body.",
        400,
        first?.path?.[0]?.toString(),
      )
    }
    const validation = await validateAnthropicKey(parsed.data.key)
    if (validation.status === "invalid") {
      return apiError(
        "validation_error",
        validation.detail ?? "Anthropic rejected the key.",
        422,
        "key",
      )
    }
    configJsonb = { api_key: parsed.data.key }
    fingerprint = buildAnthropicFingerprint(parsed.data.key)
    validationStatus = validation.status
    validationDetail = validation.detail
  } else {
    // ollama
    const parsed = ollamaPutSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return apiError(
        "validation_error",
        first?.message ?? "Invalid request body.",
        400,
        first?.path?.[0]?.toString(),
      )
    }
    const sanitized = sanitizeOllamaUrl(parsed.data.endpoint_url)
    if (!sanitized.ok) {
      return apiError("validation_error", sanitized.reason, 400, "endpoint_url")
    }
    const validation = await validateOllamaConfig({
      endpointUrl: sanitized.normalized,
      modelId: parsed.data.model_id,
      bearerToken: parsed.data.bearer_token,
    })
    if (validation.status === "invalid") {
      return apiError(
        "validation_error",
        validation.detail ?? "Ollama rejected the bearer token.",
        422,
        "bearer_token",
      )
    }
    // Persist anyway for unreachable / model_missing / rate_limited / unknown
    // — the UI surfaces the warning so the admin can re-test later.
    configJsonb = {
      endpoint_url: sanitized.normalized,
      model_id: parsed.data.model_id,
      ...(parsed.data.bearer_token
        ? { bearer_token: parsed.data.bearer_token }
        : {}),
    }
    fingerprint = buildOllamaFingerprint(
      sanitized.normalized,
      parsed.data.model_id,
    )
    validationStatus = validation.status
    validationDetail = validation.detail
  }

  // Encrypt the JSONB config via the PROJ-14 helpers.
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

  const { data: encrypted, error: encErr } = await supabase.rpc(
    "encrypt_tenant_secret",
    { p_payload: configJsonb as never },
  )
  if (encErr || !encrypted) {
    return apiError(
      "encryption_failed",
      `encrypt_tenant_secret failed: ${encErr?.message ?? "no payload"}`,
      500,
    )
  }

  // Read previous fingerprint for the audit trail before upsert.
  const { data: prevRow } = await supabase
    .from("tenant_ai_providers")
    .select("key_fingerprint")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()
  const oldFingerprint =
    (prevRow as { key_fingerprint?: string } | null)?.key_fingerprint ?? null
  const action = oldFingerprint ? "rotate" : "create"

  // Upsert the encrypted config + metadata.
  const { error: upErr } = await supabase
    .from("tenant_ai_providers")
    .upsert(
      {
        tenant_id: tenantId,
        provider,
        encrypted_config: encrypted as unknown as string,
        key_fingerprint: fingerprint,
        last_validated_at:
          validationStatus === "valid" ? new Date().toISOString() : null,
        last_validation_status: validationStatus,
        created_by: userId,
      },
      { onConflict: "tenant_id,provider" },
    )

  if (upErr) {
    if (upErr.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin role required to set AI providers.",
        403,
      )
    }
    return apiError("upsert_failed", upErr.message, 500)
  }

  // Audit. Best-effort — failure here doesn't roll back the provider write.
  const { error: auditErr } = await supabase.rpc(
    "record_tenant_ai_provider_audit",
    {
      p_tenant_id: tenantId,
      p_provider: provider,
      p_action: action,
      p_old_fingerprint: oldFingerprint,
      p_new_fingerprint: fingerprint,
    },
  )
  if (auditErr) {
    console.error(
      `[PROJ-32-c-β] record_tenant_ai_provider_audit failed for ${tenantId}/${provider}: ${auditErr.message}`,
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
    fingerprint,
    last_validation_status: validationStatus,
    last_validated_at:
      validationStatus === "valid" ? new Date().toISOString() : null,
    validation_warning: validationStatus === "valid" ? null : validationDetail,
  })
}

// ---------------------------------------------------------------------------
// DELETE — remove the provider + audit
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

  const { data: prevRow } = await supabase
    .from("tenant_ai_providers")
    .select("key_fingerprint")
    .eq("tenant_id", tenantId)
    .eq("provider", provider)
    .maybeSingle()

  if (!prevRow) {
    return NextResponse.json({ status: "not_set", provider })
  }

  const oldFingerprint = (prevRow as { key_fingerprint: string })
    .key_fingerprint

  const { error: delErr } = await supabase
    .from("tenant_ai_providers")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", provider)

  if (delErr) {
    if (delErr.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin role required to delete AI providers.",
        403,
      )
    }
    return apiError("delete_failed", delErr.message, 500)
  }

  const { error: auditErr } = await supabase.rpc(
    "record_tenant_ai_provider_audit",
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
      `[PROJ-32-c-β] record_tenant_ai_provider_audit (delete) failed for ${tenantId}/${provider}: ${auditErr.message}`,
    )
  }

  return NextResponse.json({ status: "not_set", provider })
}
