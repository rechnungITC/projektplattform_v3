import { NextResponse } from "next/server"
import { z } from "zod"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-13 — internal project chat (append-only).
// GET  /api/projects/[id]/communication/chat?limit=
// POST /api/projects/[id]/communication/chat

const createSchema = z.object({
  body: z.string().trim().min(1).max(4000),
})

const SELECT_COLUMNS =
  "id, tenant_id, project_id, sender_user_id, body, created_at"

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
  const limitRaw = url.searchParams.get("limit")
  const limitParsed = limitRaw ? Number.parseInt(limitRaw, 10) : 200
  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0 && limitParsed <= 500
      ? limitParsed
      : 200

  const { data, error } = await supabase
    .from("project_chat_messages")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return apiError("list_failed", error.message, 500)
  }
  // Return ascending so the UI can render top-down without re-sorting.
  return NextResponse.json({ messages: (data ?? []).slice().reverse() })
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

  // Chat permits any project member, not just editors — the RLS policy is
  // is_project_member, so we mirror that here with action="view".
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "communication",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const insertPayload = {
    tenant_id: access.project.tenant_id,
    project_id: projectId,
    sender_user_id: userId,
    body: parsed.data.body.trim(),
  }

  const { data: row, error } = await supabase
    .from("project_chat_messages")
    .insert(insertPayload)
    .select(SELECT_COLUMNS)
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "You must be a project member to post.",
        403
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    return apiError("create_failed", error.message, 500)
  }
  return NextResponse.json({ message: row }, { status: 201 })
}
