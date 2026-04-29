import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../_lib/route-helpers"

// PROJ-11 — date-segmented availability overrides for a resource.
// GET  /api/resources/[rid]/availabilities
// POST /api/resources/[rid]/availabilities

const SELECT_COLUMNS =
  "id, tenant_id, resource_id, start_date, end_date, fte, note, created_at"

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

const createSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    fte: z.number().min(0).max(1),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => v.start_date <= v.end_date, {
    message: "start_date must be ≤ end_date",
    path: ["end_date"],
  })

interface Ctx {
  params: Promise<{ rid: string }>
}

async function loadResource(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  resourceId: string
) {
  return supabase
    .from("resources")
    .select("id, tenant_id")
    .eq("id", resourceId)
    .maybeSingle()
}

export async function GET(_request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: resource, error: rErr } = await loadResource(supabase, rid)
  if (rErr) return apiError("read_failed", rErr.message, 500)
  if (!resource) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    resource.tenant_id as string,
    "resources",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("resource_availabilities")
    .select(SELECT_COLUMNS)
    .eq("resource_id", rid)
    .order("start_date", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ availabilities: data ?? [] })
}

export async function POST(request: Request, ctx: Ctx) {
  const { rid } = await ctx.params
  if (!z.string().uuid().safeParse(rid).success) {
    return apiError("validation_error", "Invalid resource id.", 400, "rid")
  }

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
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: resource, error: rErr } = await loadResource(supabase, rid)
  if (rErr) return apiError("read_failed", rErr.message, 500)
  if (!resource) return apiError("not_found", "Resource not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    resource.tenant_id as string,
    "resources",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const data = parsed.data
  const insertPayload = {
    tenant_id: resource.tenant_id as string,
    resource_id: rid,
    start_date: data.start_date,
    end_date: data.end_date,
    fte: data.fte,
    note: data.note?.trim() || null,
  }

  const { data: row, error } = await supabase
    .from("resource_availabilities")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Editor or admin role required.", 403)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ availability: row }, { status: 201 })
}
