import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

import {
  ACCEPTANCE_SELECT,
  acceptanceRpcErrorStatus,
  acceptanceStatusFilterSchema,
  idSchema,
  scheduleAcceptanceSchema,
} from "./_schema"

// PROJ-45-γ — Abnahmen eines Projekts.
//
// GET  — filterbare Liste (serverseitig, damit die Fläche auch bei vielen
//        Abnahmen bedienbar bleibt).
// POST — Abnahmetermin ansetzen über schedule_construction_acceptance.

export async function GET(
  request: Request,
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

  // Modul aus -> die Fläche antwortet, als gäbe es sie nicht (AC-45γ.26).
  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction"
  )
  if (moduleDenial) return moduleDenial

  const search = new URL(request.url).searchParams
  const tradeId = search.get("trade_id")
  const sectionId = search.get("section_id")
  const status = search.get("status")
  const subject = search.get("subject")
  const from = search.get("from")
  const to = search.get("to")

  let query = supabase
    .from("construction_acceptances")
    .select(ACCEPTANCE_SELECT)
    .eq("project_id", projectId)

  if (tradeId && idSchema.safeParse(tradeId).success) {
    query = query.eq("trade_id", tradeId)
  }
  if (sectionId && idSchema.safeParse(sectionId).success) {
    query = query.eq("section_id", sectionId)
  }
  if (status && acceptanceStatusFilterSchema.safeParse(status).success) {
    query = query.eq("status", status)
  }
  // Bezugsart. `gesamt` ist der ankerlose Fall (D-γ1) und deshalb die einzige
  // Bedingung, die über zwei Spalten zugleich läuft.
  if (subject === "gewerk") query = query.not("trade_id", "is", null)
  else if (subject === "abschnitt") query = query.not("section_id", "is", null)
  else if (subject === "gesamt") {
    query = query.is("trade_id", null).is("section_id", null)
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query = query.gte("scheduled_for", from)
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query = query.lte("scheduled_for", to)
  }

  const { data, error } = await query
    .order("scheduled_for", { ascending: false })
    .limit(1000)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ acceptances: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!idSchema.safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400)
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // "edit" als grobes Tor; die eigentliche, VERSCHÄRFTE Regel (nur
  // Projektleitung/Bauleitung oder Mandanten-Administration, L22) steht in der
  // Funktion — dort ist sie EINE prüfbare Stelle. Bewusst anders als beim
  // Mangel, wo β "view" gaten muss, weil dort auch Betrachter anlegen dürfen.
  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = scheduleAcceptanceSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }
  const a = parsed.data

  const { data, error } = await supabase.rpc("schedule_construction_acceptance", {
    p_project_id: projectId,
    p_scheduled_for: a.scheduled_for,
    p_trade_id: a.trade_id ?? null,
    p_section_id: a.section_id ?? null,
    p_title: a.title ?? null,
    p_notes: a.notes ?? null,
    p_supersedes_acceptance_id: a.supersedes_acceptance_id ?? null,
  })

  if (error) {
    const mapped = acceptanceRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("schedule_failed", error.message, 500)
  }

  return NextResponse.json({ acceptance: data }, { status: 201 })
}
