import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"
import { CHANNELS, OUTBOX_STATUSES } from "@/types/communication"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-13 — outbox collection.
// GET  /api/projects/[id]/communication/outbox?channel=&status=
// POST /api/projects/[id]/communication/outbox        (creates a draft)

const createSchema = z.object({
  channel: z.enum(CHANNELS as unknown as [string, ...string[]]),
  recipient: z.string().trim().min(1).max(320),
  subject: z.string().trim().max(255).optional().nullable(),
  body: z.string().min(1).max(50000),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const SELECT_COLUMNS =
  "id, tenant_id, project_id, channel, recipient, subject, body, metadata, status, error_detail, sent_at, created_by, created_at, updated_at"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
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

  const url = new URL(request.url)
  const channelFilter = url.searchParams.get("channel")
  const statusFilter = url.searchParams.get("status")

  let query = supabase
    .from("communication_outbox")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500)

  if (
    channelFilter &&
    (CHANNELS as readonly string[]).includes(channelFilter)
  ) {
    query = query.eq("channel", channelFilter)
  }
  if (
    statusFilter &&
    (OUTBOX_STATUSES as readonly string[]).includes(statusFilter)
  ) {
    query = query.eq("status", statusFilter)
  }

  const { data, error } = await query
  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  return NextResponse.json({ outbox: data ?? [] })
}

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

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "communication",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const data = parsed.data
  const insertPayload = {
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    channel: data.channel,
    recipient: data.recipient.trim(),
    subject: data.subject?.trim() || null,
    body: data.body,
    metadata: data.metadata ?? {},
    status: "draft",
    created_by: userId,
  }

  const { data: row, error } = await supabase
    .from("communication_outbox")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Editor or lead role required to create outbox entries.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ outbox: row }, { status: 201 })
}
