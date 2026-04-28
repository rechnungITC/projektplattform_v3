import { NextResponse } from "next/server"
import { z } from "zod"

import { PROJECT_METHODS } from "@/types/project-method"
import { PROJECT_TYPES } from "@/types/project"

import { apiError, getAuthenticatedUserId } from "../_lib/route-helpers"

// PROJ-5 — wizard drafts collection endpoint.
// GET  /api/wizard-drafts           — current user's drafts in current tenant
// POST /api/wizard-drafts           — create a new draft

const wizardDataSchema = z
  .object({
    name: z.string().max(255).optional().default(""),
    description: z.string().max(5000).optional().default(""),
    project_number: z.string().max(100).optional().default(""),
    planned_start_date: z.string().nullable().optional().default(null),
    planned_end_date: z.string().nullable().optional().default(null),
    responsible_user_id: z.string().uuid().optional().nullable(),
    project_type: z
      .enum(PROJECT_TYPES as unknown as [string, ...string[]])
      .nullable()
      .optional()
      .default(null),
    project_method: z
      .enum(PROJECT_METHODS as unknown as [string, ...string[]])
      .nullable()
      .optional()
      .default(null),
    type_specific_data: z.record(z.string(), z.string()).optional().default({}),
  })
  .passthrough()

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  data: wizardDataSchema,
})

const listQuerySchema = z.object({
  tenant_id: z.string().uuid(),
})

// -----------------------------------------------------------------------------
// GET /api/wizard-drafts?tenant_id=...
// -----------------------------------------------------------------------------

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = listQuerySchema.safeParse({
    tenant_id: url.searchParams.get("tenant_id") ?? undefined,
  })
  if (!parsed.success) {
    return apiError(
      "validation_error",
      "tenant_id query parameter is required.",
      400,
      "tenant_id"
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const { data, error } = await supabase
    .from("project_wizard_drafts")
    .select(
      "id, tenant_id, created_by, name, project_type, project_method, data, created_at, updated_at"
    )
    .eq("tenant_id", parsed.data.tenant_id)
    .order("updated_at", { ascending: false })
    .limit(100)

  if (error) {
    return apiError("list_failed", error.message, 500)
  }

  return NextResponse.json({ drafts: data ?? [] })
}

// -----------------------------------------------------------------------------
// POST /api/wizard-drafts
// -----------------------------------------------------------------------------

export async function POST(request: Request) {
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

  const { tenant_id, data } = parsed.data
  const denormName = data.name?.trim() ? data.name.trim() : null

  const { data: row, error } = await supabase
    .from("project_wizard_drafts")
    .insert({
      tenant_id,
      created_by: userId,
      name: denormName,
      project_type: data.project_type ?? null,
      project_method: data.project_method ?? null,
      data,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Not allowed to create drafts in this tenant.",
        403
      )
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ draft: row }, { status: 201 })
}
