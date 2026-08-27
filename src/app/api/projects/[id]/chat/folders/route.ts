/**
 * PROJ-151-α — Ordner für Unterhaltungen (AC-151.20).
 *
 * Privat je Nutzer wie die Unterhaltungen selbst (L2). Ohne Ordner bleibt eine
 * Unterhaltung erreichbar — der Ordner ist reine Ablage, keine Pflicht.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const CreateSchema = z.object({ name: z.string().trim().min(1).max(120) })

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const gate = await requireModuleActive(supabase, access.project.tenant_id, "ai_chat")
  if (gate) return gate

  const { data, error } = await supabase
    .from("ai_chat_folders")
    .select("id, name, created_at")
    .eq("project_id", projectId)
    .order("name", { ascending: true })

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ folders: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const gate = await requireModuleActive(supabase, access.project.tenant_id, "ai_chat", {
    intent: "write",
  })
  if (gate) return gate

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError("validation_error", "Invalid body.", 422)

  const { data, error } = await supabase
    .from("ai_chat_folders")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      user_id: userId,
      name: parsed.data.name,
    })
    .select("id, name, created_at")
    .single()

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ folder: data }, { status: 201 })
}
