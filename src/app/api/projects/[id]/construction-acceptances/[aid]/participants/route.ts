import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

import { acceptanceRpcErrorStatus, idSchema, participantsSchema } from "../../_schema"

// PROJ-45-γ — Teilnehmerliste setzen (ersetzt die bestehende).
//
// Genau EINE Quelle je Zeile: Stakeholder, Nachunternehmer oder Freitext-Name
// (Q-γ3). Das Projektmitglied ist bewusst KEINE eigene Achse — ein anwesendes
// Mitglied ist fachlich ein Stakeholder, und der Kontobezug hängt bereits dort.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; aid: string }> }
) {
  const { id: projectId, aid } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(aid).success) {
    return apiError("invalid_id", "Malformed id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: owned } = await supabase
    .from("construction_acceptances")
    .select("id")
    .eq("id", aid)
    .eq("project_id", projectId)
    .maybeSingle()
  if (!owned) return apiError("not_found", "Abnahme nicht gefunden.", 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = participantsSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await supabase.rpc(
    "set_construction_acceptance_participants",
    {
      p_acceptance_id: aid,
      p_participants: parsed.data.participants,
    }
  )

  if (error) {
    const mapped = acceptanceRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("participants_failed", error.message, 500)
  }

  return NextResponse.json({ count: data })
}
