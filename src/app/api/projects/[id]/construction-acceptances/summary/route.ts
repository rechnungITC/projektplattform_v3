import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

import { idSchema } from "../_schema"

// PROJ-45-γ — Kopfzahlen und Abnahmestand je Gewerk.
//
// Die Auswertung ist `SECURITY INVOKER`: sie läuft im Recht des Aufrufers,
// damit ein Zähler nicht verrät, was die Zeilenliste korrekt verbirgt. Deshalb
// wird sie zwingend mit dem SITZUNGSGEBUNDENEN Client gerufen, nie mit dem
// Dienst-Schlüssel — sonst wäre das INVOKER-Modell wirkungslos.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc("construction_acceptance_summary", {
    p_project_id: projectId,
  })

  if (error) return apiError("summary_failed", error.message, 500)
  return NextResponse.json({ summary: data })
}
