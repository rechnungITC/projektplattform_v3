import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { CHANNELS } from "@/types/communication"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

// PROJ-13 — single-outbox endpoints.
// GET    /api/projects/[id]/communication/outbox/[oid]
// PATCH  /api/projects/[id]/communication/outbox/[oid]   (drafts only)
// DELETE /api/projects/[id]/communication/outbox/[oid]   (drafts only)

const patchSchema = z
  .object({
    channel: z.enum(CHANNELS as unknown as [string, ...string[]]).optional(),
    recipient: z.string().trim().min(1).max(320).optional(),
    subject: z.string().trim().max(255).optional().nullable(),
    body: z.string().min(1).max(50000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: "At least one field must be provided.",
  })

const SELECT_COLUMNS =
  "id, tenant_id, project_id, channel, recipient, subject, body, metadata, status, error_detail, sent_at, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string; oid: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid outbox id.", 400, "oid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "communication",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase
    .from("communication_outbox")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("id", oid)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    return apiError("not_found", "Outbox entry not found.", 404)
  }
  return NextResponse.json({ outbox: data })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid outbox id.", 400, "oid")
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

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "communication",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Drafts only — once it's queued/sent/failed/suppressed, content is frozen.
  const { data: existing, error: existingErr } = await supabase
    .from("communication_outbox")
    .select("status")
    .eq("project_id", projectId)
    .eq("id", oid)
    .maybeSingle()
  if (existingErr) {
    return apiError("read_failed", existingErr.message, 500)
  }
  if (!existing) {
    return apiError("not_found", "Outbox entry not found.", 404)
  }
  if (existing.status !== "draft") {
    return apiError(
      "invalid_state",
      `Only drafts may be edited. Current status: ${existing.status}.`,
      409
    )
  }

  const data = parsed.data
  const update: Record<string, unknown> = {}
  if (data.channel !== undefined) update.channel = data.channel
  if (data.recipient !== undefined) update.recipient = data.recipient.trim()
  if (data.subject !== undefined)
    update.subject = data.subject?.trim() || null
  if (data.body !== undefined) update.body = data.body
  if (data.metadata !== undefined) update.metadata = data.metadata

  const { data: row, error } = await supabase
    .from("communication_outbox")
    .update(update)
    .eq("project_id", projectId)
    .eq("id", oid)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      return apiError("not_found", "Outbox entry not found.", 404)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("update_failed", error.message, 500)
  }
  return NextResponse.json({ outbox: row })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id: projectId, oid } = await ctx.params
  if (!z.string().uuid().safeParse(oid).success) {
    return apiError("validation_error", "Invalid outbox id.", 400, "oid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "communication",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  // Drafts only — terminal rows form the audit trail and must not be erased.
  const { data: existing, error: existingErr } = await supabase
    .from("communication_outbox")
    .select("status")
    .eq("project_id", projectId)
    .eq("id", oid)
    .maybeSingle()
  if (existingErr) {
    return apiError("read_failed", existingErr.message, 500)
  }
  if (!existing) {
    return apiError("not_found", "Outbox entry not found.", 404)
  }
  if (existing.status !== "draft") {
    return apiError(
      "invalid_state",
      `Only drafts may be deleted. Current status: ${existing.status}.`,
      409
    )
  }

  const { error } = await supabase
    .from("communication_outbox")
    .delete()
    .eq("project_id", projectId)
    .eq("id", oid)

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to delete outbox entries.",
        403
      )
    }
    return apiError("delete_failed", error.message, 500)
  }
  return new NextResponse(null, { status: 204 })
}
