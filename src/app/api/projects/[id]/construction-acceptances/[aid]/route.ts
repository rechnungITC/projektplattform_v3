import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

import {
  ACCEPTANCE_EVENT_SELECT,
  ACCEPTANCE_PARTICIPANT_SELECT,
  ACCEPTANCE_RESERVATION_SELECT,
  ACCEPTANCE_SELECT,
  acceptanceRpcErrorStatus,
  idSchema,
  updateAcceptanceSchema,
} from "../_schema"

// PROJ-45-γ — eine Abnahme.
//
// GET   — Detail samt Teilnehmern, Vorbehalten und unveränderlichem Verlauf.
// PATCH — Ändern, solange angesetzt (update_construction_acceptance).

/**
 * Prüft, dass die Abnahme wirklich zu dem Projekt in der Adresse gehört.
 *
 * Ohne diese Prüfung wäre die Projekt-Kennung in der URL dekorativ: die
 * Funktion autorisiert gegen das ECHTE Projekt der Abnahme, eine Mutation
 * könnte also über die Adresse eines anderen Projekts laufen. Keine
 * Rechte-Umgehung — aber β hat genau diese Lockerheit in der Durchsicht
 * gefunden und geschlossen; γ zieht sie von Anfang an mit.
 */
async function belongsToProject(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUserId>>["supabase"],
  acceptanceId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("construction_acceptances")
    .select("id")
    .eq("id", acceptanceId)
    .eq("project_id", projectId)
    .maybeSingle()
  return Boolean(data)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; aid: string }> }
) {
  const { id: projectId, aid } = await params
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(aid).success) {
    return apiError("invalid_id", "Malformed id.", 400)
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

  const { data: acceptance, error } = await supabase
    .from("construction_acceptances")
    .select(ACCEPTANCE_SELECT)
    .eq("id", aid)
    .eq("project_id", projectId)
    .maybeSingle()

  if (error) return apiError("load_failed", error.message, 500)
  if (!acceptance) return apiError("not_found", "Abnahme nicht gefunden.", 404)

  const [participants, reservations, events] = await Promise.all([
    supabase
      .from("construction_acceptance_participants")
      .select(ACCEPTANCE_PARTICIPANT_SELECT)
      .eq("acceptance_id", aid)
      .order("sort_order", { ascending: true }),
    supabase
      .from("construction_acceptance_reservations")
      .select(ACCEPTANCE_RESERVATION_SELECT)
      .eq("acceptance_id", aid),
    supabase
      .from("construction_acceptance_events")
      .select(ACCEPTANCE_EVENT_SELECT)
      .eq("acceptance_id", aid)
      .order("created_at", { ascending: true }),
  ])

  return NextResponse.json({
    acceptance,
    participants: participants.data ?? [],
    reservations: reservations.data ?? [],
    events: events.data ?? [],
  })
}

export async function PATCH(
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

  if (!(await belongsToProject(supabase, aid, projectId))) {
    return apiError("not_found", "Abnahme nicht gefunden.", 404)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = updateAcceptanceSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }
  const a = parsed.data

  const { data, error } = await supabase.rpc("update_construction_acceptance", {
    p_acceptance_id: aid,
    p_scheduled_for: a.scheduled_for ?? null,
    p_title: a.title ?? null,
    p_clear_title: a.clear_title ?? false,
    p_notes: a.notes ?? null,
    p_clear_notes: a.clear_notes ?? false,
  })

  if (error) {
    const mapped = acceptanceRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("update_failed", error.message, 500)
  }

  return NextResponse.json({ acceptance: data })
}

export { belongsToProject }
