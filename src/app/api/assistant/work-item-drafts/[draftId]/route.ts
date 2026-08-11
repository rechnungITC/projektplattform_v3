import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

/**
 * PROJ-144 — DELETE /api/assistant/work-item-drafts/[draftId]
 *
 * „Verwerfen" im Overlay. Der Entwurf wird auf `discarded` gesetzt statt
 * gelöscht: so kann derselbe Entwurf nicht erneut bestätigt werden, und der
 * Aufräum-Lauf (14 Tage) entfernt die Zeile ohnehin.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const { draftId } = await context.params
  if (!z.string().uuid().safeParse(draftId).success) {
    return apiError("validation_error", "Invalid draft id.", 400, "draftId")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("no_active_tenant", "No active tenant.", 403)

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const moduleDenied = await requireModuleActive(supabase, tenantId, "assistant", {
    intent: "write",
  })
  if (moduleDenied) return moduleDenied

  // Nur ein offener Entwurf ist verwerfbar. Ein bereits bestätigter bleibt als
  // Verbraucht-Nachweis stehen (siehe created_work_item_id).
  const { data, error } = await supabase
    .from("assistant_work_item_drafts")
    .update({ status: "discarded" })
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("id")
    .maybeSingle()

  if (error) return apiError("discard_failed", error.message, 500)
  if (!data) {
    // Fremd, nicht vorhanden oder nicht mehr offen — bewusst nicht
    // unterschieden, damit die Antwort nichts über fremde Entwürfe verrät.
    return apiError("not_found", "Draft not found or already used.", 404)
  }

  return NextResponse.json({ discarded: true, draft_id: draftId })
}
