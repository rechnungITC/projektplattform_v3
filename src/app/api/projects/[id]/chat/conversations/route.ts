/**
 * PROJ-151-α — Unterhaltungen eines Projekts.
 *
 * Lock L2: nur eigene. Ein `user_id`-Filter steht hier bewusst NICHT — die
 * Zugriffsregel lässt ohnehin nur eigene Zeilen durch, und eine zweite Prüfung
 * im Code wäre eine zweite Wahrheit, die auseinanderlaufen kann.
 *
 * Modul-Tor vor der Fachlogik; Lese-Absicht → 404, damit eine abgeschaltete
 * Fläche ihre Existenz nicht verrät (PROJ-17-ST-02, bestätigt in PROJ-Y-143n).
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folder_id: z.string().uuid().nullable().optional(),
})

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
    .from("ai_chat_conversations")
    .select("id, title, folder_id, created_at, updated_at")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ conversations: data ?? [] })
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
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body.", 422)
  }

  const { data, error } = await supabase
    .from("ai_chat_conversations")
    .insert({
      tenant_id: access.project.tenant_id,
      project_id: projectId,
      user_id: userId,
      title: parsed.data.title,
      folder_id: parsed.data.folder_id ?? null,
    })
    .select("id, title, folder_id, created_at, updated_at")
    .single()

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ conversation: data }, { status: 201 })
}
