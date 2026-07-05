/**
 * PROJ-93 — Trusted-EU-Processor DPA attest / revoke (Azure only).
 *
 *   POST   /api/tenants/[id]/ai-providers/azure/dpa   { reference }  → attest
 *   DELETE /api/tenants/[id]/ai-providers/azure/dpa                  → revoke
 *
 * Attesting a DPA makes the tenant's EU Azure resource Class-3-eligible (the
 * resolver additionally enforces the EU-region check). Both operations go
 * through admin-gated SECURITY DEFINER RPCs that write an append-only audit
 * event — never a direct UPDATE (state-machine convention). Class-3 stays
 * Ollama-only until a DPA is attested; revoke takes effect on the next resolve.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string; provider: string }>
}

const attestSchema = z.object({
  reference: z
    .string()
    .min(3, "DPA reference must be at least 3 characters.")
    .max(200, "DPA reference is implausibly long."),
})

/** DPA applies only to the Azure trusted-processor. */
function guardAzure(provider: string): NextResponse | null {
  if (provider !== "azure") {
    return apiError(
      "validation_error",
      "DPA attestation applies only to the Azure trusted processor.",
      400,
      "provider",
    )
  }
  return null
}

/** Map the RPC's raised errcodes to HTTP responses. */
function mapRpcError(message: string): NextResponse {
  if (message.includes("forbidden")) {
    return apiError("forbidden", "Tenant admin role required.", 403)
  }
  if (message.includes("no_azure_provider")) {
    return apiError(
      "no_azure_provider",
      "Configure an Azure provider before attesting a DPA.",
      409,
      "provider",
    )
  }
  if (message.includes("dpa_reference_required")) {
    return apiError("validation_error", "DPA reference is required.", 400, "reference")
  }
  return apiError("rpc_failed", message, 500)
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: tenantId, provider } = await ctx.params

  const notAzure = guardAzure(provider)
  if (notAzure) return notAzure

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = attestSchema.safeParse(body)
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

  const { error } = await supabase.rpc("attest_tenant_ai_provider_dpa", {
    p_tenant_id: tenantId,
    p_reference: parsed.data.reference,
  })
  if (error) return mapRpcError(error.message)

  return NextResponse.json({ status: "attested", provider })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: tenantId, provider } = await ctx.params

  const notAzure = guardAzure(provider)
  if (notAzure) return notAzure

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { error } = await supabase.rpc("revoke_tenant_ai_provider_dpa", {
    p_tenant_id: tenantId,
  })
  if (error) return mapRpcError(error.message)

  return NextResponse.json({ status: "revoked", provider })
}
