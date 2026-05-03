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
} from "../../../_lib/route-helpers"

// PROJ-8 — collection endpoint for project stakeholders.
// GET  /api/projects/[id]/stakeholders?include_inactive=false
// POST /api/projects/[id]/stakeholders

const createSchema = z.object({
  kind: z.enum(STAKEHOLDER_KINDS as unknown as [string, ...string[]]),
  origin: z.enum(STAKEHOLDER_ORIGINS as unknown as [string, ...string[]]),
  name: z.string().trim().min(1).max(255),
  role_key: z.string().max(100).optional().nullable(),
  org_unit: z.string().max(255).optional().nullable(),
  contact_email: z.string().email().max(320).optional().nullable().or(z.literal("")),
  contact_phone: z.string().max(64).optional().nullable(),
  influence: z
    .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
    .default("medium"),
  impact: z
    .enum(STAKEHOLDER_SCORES as unknown as [string, ...string[]])
    .default("medium"),
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
  // PROJ-31 — flag stakeholder as eligible approver for formal Decisions.
  // Default false (DB default). Toggling to true enables the stakeholder
  // in the Decision-Approval-Sheet's approver picker.
  is_approver: z.boolean().optional(),
})

interface Ctx {
  params: Promise<{ id: string }>
}

// -----------------------------------------------------------------------------
// GET /api/projects/[id]/stakeholders
// -----------------------------------------------------------------------------

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const url = new URL(request.url)
  const includeInactive = url.searchParams.get("include_inactive") === "true"

  let query = supabase
    .from("stakeholders")
    .select(
      "id, tenant_id, project_id, kind, origin, name, role_key, org_unit, contact_email, contact_phone, influence, impact, linked_user_id, notes, is_active, is_approver, reasoning, stakeholder_type_key, management_level, decision_authority, attitude, conflict_potential, communication_need, preferred_channel, created_by, created_at, updated_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })

  if (!includeInactive) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query
  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  return NextResponse.json({ stakeholders: data ?? [] })
}

// -----------------------------------------------------------------------------
// POST /api/projects/[id]/stakeholders
// -----------------------------------------------------------------------------

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
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

  const data = parsed.data
  const insertPayload = {
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    kind: data.kind,
    origin: data.origin,
    name: data.name.trim(),
    role_key: data.role_key?.trim() || null,
    org_unit: data.org_unit?.trim() || null,
    contact_email: data.contact_email?.trim() || null,
    contact_phone: data.contact_phone?.trim() || null,
    influence: data.influence,
    impact: data.impact,
    linked_user_id: data.linked_user_id ?? null,
    notes: data.notes?.trim() || null,
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("stakeholders")
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to add stakeholders.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ stakeholder: row }, { status: 201 })
}
