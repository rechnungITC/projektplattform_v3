/**
 * PROJ-45-ε (AC-45ε.15, AC-45εH-2) — Fotozähler je Anker.
 *
 * Eine `SECURITY INVOKER`-Auswertung, damit die Zeilenregeln des Aufrufers
 * gelten: ein Zähler über verborgene Zeilen wäre ein Leck, auch wenn die
 * Zeilenliste selbst korrekt verborgen ist (Hausregel „Aggregate leak").
 */

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

import { NextResponse, apiError, idSchema, rpcError } from "../_schema"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc("construction_photo_counts", {
    p_project_id: projectId,
  })
  if (error) {
    return rpcError(error.code, error.message ?? "Zähler nicht verfügbar.")
  }
  return NextResponse.json({ counts: data })
}
