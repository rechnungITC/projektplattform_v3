import { NextResponse } from "next/server"
import { z } from "zod"

import {
  COMMUNICATION_NEEDS,
  DECISION_AUTHORITIES,
  MANAGEMENT_LEVELS,
  PREFERRED_CHANNELS,
  STAKEHOLDER_ATTITUDES,
  STAKEHOLDER_KINDS,
  STAKEHOLDER_ORIGINS,
  STAKEHOLDER_SCORES,
} from "@/types/stakeholder"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-8 — single-stakeholder endpoints.
// GET   /api/projects/[id]/stakeholders/[sid]
// PATCH /api/projects/[id]/stakeholders/[sid]

const patchSchema = z
  .object({
    kind: z.enum(STAKEHOLDER_KINDS as unknown as [string, ...string[]]).optional(),
    origin: z
      .enum(STAKEHOLDER_ORIGINS as unknown as [string, ...string[]])
      .optional(),
    name: z.string().trim().min(1).max(255).optional(),
    role_key: z.string().max(100).optional().nullable(),
    org_unit: z.string().max(255).optional().nullable(),
    contact_email: z
      .string()
      .email()
      .max(320)
      .optional()
      .nullable()
      .or(z.literal("")),
    contact_phone: z.string().max(64).optional().nullable(),
    influence: z
      .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
      .optional(),
    impact: z
      .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
      .optional(),
    linked_user_id: z.string().uuid().optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    // PROJ-33 Phase 33-α — qualitative fields (alle nullable)
    reasoning: z.string().max(5000).optional().nullable(),
    stakeholder_type_key: z.string().max(64).optional().nullable(),
    management_level: z
      .enum(MANAGEMENT_LEVELS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    decision_authority: z
      .enum(DECISION_AUTHORITIES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    attitude: z
      .enum(STAKEHOLDER_ATTITUDES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    conflict_potential: z
      .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    communication_need: z
      .enum(COMMUNICATION_NEEDS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    preferred_channel: z
      .enum(PREFERRED_CHANNELS as unknown as [string, ...string[]])
      .optional()
      .nullable(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

interface Ctx {
  params: Promise<{ id: string; sid: string }>
}

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("stakeholders")
    .select(
      "id, tenant_id, project_id, kind, origin, name, role_key, org_unit, contact_email, contact_phone, influence, impact, linked_user_id, notes, is_active, is_approver, reasoning, stakeholder_type_key, management_level, decision_authority, attitude, conflict_potential, communication_need, preferred_channel, created_by, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .eq("id", sid)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Stakeholder not found.", 404)
  }
  return NextResponse.json({ stakeholder: data })
}

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, sid } = await ctx.params
  if (!z.string().uuid().safeParse(sid).success) {
    return apiError("validation_error", "Invalid stakeholder id.", 400, "sid")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  // Build the update object — only fields explicitly present in the request
  // body get persisted. Empty strings on optional text fields become NULL.
  const data = parsed.data
  const update: Record<string, unknown> = {}
  if (data.kind !== undefined) update.kind = data.kind
  if (data.origin !== undefined) update.origin = data.origin
  if (data.name !== undefined) update.name = data.name.trim()
  if (data.role_key !== undefined) update.role_key = data.role_key?.trim() || null
  if (data.org_unit !== undefined) update.org_unit = data.org_unit?.trim() || null
  if (data.contact_email !== undefined)
    update.contact_email = data.contact_email?.trim() || null
  if (data.contact_phone !== undefined)
    update.contact_phone = data.contact_phone?.trim() || null
  if (data.influence !== undefined) update.influence = data.influence
  if (data.impact !== undefined) update.impact = data.impact
  if (data.linked_user_id !== undefined)
    update.linked_user_id = data.linked_user_id ?? null
  if (data.notes !== undefined) update.notes = data.notes?.trim() || null
  // PROJ-33 Phase 33-α — qualitative Bewertungs-Felder
  if (data.reasoning !== undefined)
    update.reasoning = data.reasoning?.trim() || null
  if (data.stakeholder_type_key !== undefined)
    update.stakeholder_type_key = data.stakeholder_type_key?.trim() || null
  if (data.management_level !== undefined)
    update.management_level = data.management_level ?? null
  if (data.decision_authority !== undefined)
    update.decision_authority = data.decision_authority ?? null
  if (data.attitude !== undefined) update.attitude = data.attitude ?? null
  if (data.conflict_potential !== undefined)
    update.conflict_potential = data.conflict_potential ?? null
  if (data.communication_need !== undefined)
    update.communication_need = data.communication_need ?? null
  if (data.preferred_channel !== undefined)
    update.preferred_channel = data.preferred_channel ?? null

  const { data: row, error } = await supabase
    .from("stakeholders")
    .update(update)
    .eq("project_id", projectId)
    .eq("id", sid)
    .select()
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Stakeholder not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ stakeholder: row })
}
