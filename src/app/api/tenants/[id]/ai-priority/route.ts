/**
 * PROJ-32-c-γ — Tenant AI Priority Matrix
 *
 *   GET /api/tenants/[id]/ai-priority
 *   PUT /api/tenants/[id]/ai-priority
 *
 * The priority matrix is a sparse list of (purpose, data_class, provider_order)
 * tuples. Missing rows fall back to hardcoded defaults in the resolver.
 *
 * PUT body shape:
 *   { rules: [{ purpose, data_class, provider_order }, ...] }
 *
 * The whole matrix is replaced atomically (DELETE all + INSERT new) so a
 * partial save can never leave the matrix in an inconsistent state.
 *
 * Class-3 backend validation (CIA HIGH-risk lock):
 *   * Reject any rule with data_class=3 that contains a non-local provider.
 *   * Today only `ollama` is local; 32b will keep this defensive check
 *     in lockstep with the new providers.
 *
 * Admin-only via requireTenantAdmin.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

// Must stay in lockstep with src/lib/ai/types.ts AIPurpose union
const PURPOSES = [
  "risks",
  "decisions",
  "work_items",
  "open_items",
  "narrative",
] as const

// Must stay in lockstep with the tenant_ai_provider_priority CHECK
// constraint and the AIKeyProvider union in key-resolver.ts.
const KNOWN_PROVIDERS = ["anthropic", "ollama"] as const

// Local-only providers for Class-3. Keep in lockstep with the DB CHECK
// constraint `tenant_ai_provider_priority_class3_local_only`.
const LOCAL_PROVIDERS: readonly string[] = ["ollama"]

const ruleSchema = z.object({
  purpose: z.enum(PURPOSES),
  data_class: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  provider_order: z
    .array(z.enum(KNOWN_PROVIDERS))
    .min(1, "provider_order must contain at least one provider.")
    .max(KNOWN_PROVIDERS.length, "provider_order has duplicates."),
})

const putBodySchema = z.object({
  rules: z.array(ruleSchema).max(15, "Matrix has at most 5 purposes × 3 classes = 15 rules."),
})

// ---------------------------------------------------------------------------
// GET — return the full matrix
// ---------------------------------------------------------------------------

export async function GET(_request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  const { data, error } = await supabase
    .from("tenant_ai_provider_priority")
    .select("purpose, data_class, provider_order, updated_at, updated_by")
    .eq("tenant_id", tenantId)
    .order("purpose", { ascending: true })
    .order("data_class", { ascending: true })

  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({
    rules: (data ?? []).map((row) => ({
      purpose: row.purpose,
      data_class: row.data_class,
      provider_order: row.provider_order,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    })),
  })
}

// ---------------------------------------------------------------------------
// PUT — atomic full-matrix replace
// ---------------------------------------------------------------------------

export async function PUT(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params

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
      first?.path?.join(".") ?? undefined,
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const denied = await requireTenantAdmin(supabase, tenantId, userId)
  if (denied) return denied

  // Class-3 defense-in-depth at the API boundary. The DB CHECK is the
  // second line; this rejects with a useful error message before the
  // CHECK fires.
  for (const rule of parsed.data.rules) {
    if (rule.data_class !== 3) continue
    const cloudProviders = rule.provider_order.filter(
      (p) => !LOCAL_PROVIDERS.includes(p),
    )
    if (cloudProviders.length > 0) {
      return apiError(
        "validation_error",
        `Class-3 rules must use local providers only. '${cloudProviders.join(", ")}' is a cloud provider — Class-3 data must not leave the tenant infrastructure.`,
        422,
        `rules.${parsed.data.rules.indexOf(rule)}.provider_order`,
      )
    }
  }

  // Detect duplicate (purpose, data_class) tuples in the input — the
  // DB PK would catch this, but a 400 with a precise error message is
  // friendlier than a 500 from a duplicate-key violation.
  const seen = new Set<string>()
  for (const rule of parsed.data.rules) {
    const key = `${rule.purpose}:${rule.data_class}`
    if (seen.has(key)) {
      return apiError(
        "validation_error",
        `Duplicate rule for purpose='${rule.purpose}' data_class=${rule.data_class}.`,
        400,
        "rules",
      )
    }
    seen.add(key)
  }

  // Read the previous matrix for the audit trail.
  const { data: prevRows } = await supabase
    .from("tenant_ai_provider_priority")
    .select("purpose, data_class, provider_order")
    .eq("tenant_id", tenantId)
  const prevMap = new Map<string, string[]>()
  for (const row of prevRows ?? []) {
    prevMap.set(
      `${row.purpose}:${row.data_class}`,
      (row.provider_order as string[]) ?? [],
    )
  }

  // Atomic replace: delete all rules for this tenant, then insert new ones.
  // Both ops run as the same authenticated user; RLS protects them.
  const { error: delErr } = await supabase
    .from("tenant_ai_provider_priority")
    .delete()
    .eq("tenant_id", tenantId)
  if (delErr) {
    if (delErr.code === "42501") {
      return apiError(
        "forbidden",
        "Tenant admin role required to update AI priority.",
        403,
      )
    }
    return apiError("delete_failed", delErr.message, 500)
  }

  if (parsed.data.rules.length > 0) {
    const insertPayload = parsed.data.rules.map((rule) => ({
      tenant_id: tenantId,
      purpose: rule.purpose,
      data_class: rule.data_class,
      provider_order: rule.provider_order,
      updated_by: userId,
    }))
    const { error: insErr } = await supabase
      .from("tenant_ai_provider_priority")
      .insert(insertPayload)
    if (insErr) {
      // 23514 = check_violation (e.g. unknown provider, class-3 with
      // cloud — the DB CHECK is our second line of defense).
      if (insErr.code === "23514") {
        return apiError("constraint_violation", insErr.message, 422)
      }
      if (insErr.code === "42501") {
        return apiError(
          "forbidden",
          "Tenant admin role required to update AI priority.",
          403,
        )
      }
      return apiError("insert_failed", insErr.message, 500)
    }
  }

  // Audit trail: write one row per CHANGED cell. Cells that are
  // unchanged or were untouched in both old and new matrix are skipped.
  const newMap = new Map<string, string[]>()
  for (const rule of parsed.data.rules) {
    newMap.set(`${rule.purpose}:${rule.data_class}`, rule.provider_order)
  }
  const allKeys = new Set([...prevMap.keys(), ...newMap.keys()])
  for (const key of allKeys) {
    const [purpose, classStr] = key.split(":")
    const oldOrder = prevMap.get(key) ?? null
    const newOrder = newMap.get(key) ?? null
    if (oldOrder === null && newOrder === null) continue
    if (
      oldOrder &&
      newOrder &&
      oldOrder.length === newOrder.length &&
      oldOrder.every((v, i) => v === newOrder[i])
    ) {
      continue
    }
    const { error: auditErr } = await supabase.rpc(
      "record_tenant_ai_priority_audit",
      {
        p_tenant_id: tenantId,
        p_purpose: purpose,
        p_data_class: Number(classStr),
        p_old_order: oldOrder,
        p_new_order: newOrder,
      },
    )
    if (auditErr) {
      console.error(
        `[PROJ-32-c-γ] record_tenant_ai_priority_audit failed for ${tenantId}/${key}: ${auditErr.message}`,
      )
    }
  }

  return NextResponse.json({
    rules: parsed.data.rules,
  })
}
