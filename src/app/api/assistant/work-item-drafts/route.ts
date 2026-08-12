import { NextResponse } from "next/server"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

/**
 * PROJ-144 — GET /api/assistant/work-item-drafts
 *
 * Die offenen Sprach-Entwürfe des Aufrufers für die Liste im Assistant-Overlay
 * (Lock L7). Nutzer-privat: die RLS-Regel der Tabelle lässt ausschließlich
 * eigene Zeilen durch — auch Tenant-Admins und Projektleitungen sehen hier
 * nichts Fremdes (AC-144.18). Der `user_id`-Filter unten ist Gürtel zum
 * Hosenträger, nicht der Schutz selbst.
 */
export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("no_active_tenant", "No active tenant.", 403)

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const moduleDenied = await requireModuleActive(supabase, tenantId, "assistant")
  if (moduleDenied) return moduleDenied

  const { data, error } = await supabase
    .from("assistant_work_item_drafts")
    .select(
      "id, title, description, target_kind, requested_kind, project_id, created_at, projects(name)",
    )
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) return apiError("list_failed", error.message, 500)

  const drafts = (data ?? []).map((row) => {
    const draft = row as {
      id: string
      title: string
      description: string | null
      target_kind: string
      requested_kind: string | null
      project_id: string
      created_at: string
      projects?: { name?: string } | { name?: string }[] | null
    }
    const project = Array.isArray(draft.projects)
      ? draft.projects[0]
      : draft.projects
    return {
      id: draft.id,
      title: draft.title,
      description: draft.description,
      target_kind: draft.target_kind,
      requested_kind: draft.requested_kind,
      kind_was_mapped:
        draft.requested_kind !== null &&
        draft.requested_kind !== draft.target_kind,
      project_id: draft.project_id,
      project_name: project?.name ?? "",
      created_at: draft.created_at,
    }
  })

  return NextResponse.json({ drafts })
}
