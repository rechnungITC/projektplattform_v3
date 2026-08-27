/**
 * PROJ-151-α — Favorit setzen/entfernen (AC-151.19).
 *
 * Favoriten sind privat: die Regel lässt nur eigene Zeilen zu. Das Anlegen ist
 * bewusst idempotent — zweimal „Favorit" ist kein Fehler, sondern derselbe
 * Wunsch.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import { requireModuleActive } from "@/lib/tenant-settings/server"

export async function PUT(
  _request: Request,
  context: { params: Promise<{ tid: string }> },
) {
  const { tid } = await context.params
  if (!z.string().uuid().safeParse(tid).success) {
    return apiError("validation_error", "Invalid template id.", 400, "tid")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("not_found", "No active tenant.", 404)
  const gate = await requireModuleActive(supabase, tenantId, "ai_chat", { intent: "write" })
  if (gate) return gate

  const { error } = await supabase
    .from("ai_chat_prompt_favorites")
    .upsert(
      { template_id: tid, user_id: userId, tenant_id: tenantId },
      { onConflict: "template_id,user_id" },
    )

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ is_favorite: true })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ tid: string }> },
) {
  const { tid } = await context.params
  if (!z.string().uuid().safeParse(tid).success) {
    return apiError("validation_error", "Invalid template id.", 400, "tid")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("not_found", "No active tenant.", 404)
  const gate = await requireModuleActive(supabase, tenantId, "ai_chat", { intent: "write" })
  if (gate) return gate

  const { error } = await supabase
    .from("ai_chat_prompt_favorites")
    .delete()
    .eq("template_id", tid)
    .eq("user_id", userId)

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ is_favorite: false })
}
