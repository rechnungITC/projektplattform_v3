import { NextResponse } from "next/server"

import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"

import { acceptanceActionSchema, acceptanceRpcErrorStatus, idSchema } from "../../_schema"

// PROJ-45-γ — Absagen und Protokollieren.
//
// Zwei Aktionen auf einem Endpunkt, wie bei β der Statuswechsel. Das
// Protokollieren ist der einzige Weg, an dem neue Vorbehalte entstehen — sie
// werden in der Funktion über die BESTEHENDE β-Anlegefunktion zu echten
// Mängeln, damit Nummernvergabe, Projektprüfung und Anlege-Ereignis nicht
// dupliziert werden.
export async function POST(
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

  // Die Adresse darf nicht dekorativ sein (siehe Kommentar in ../route.ts).
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

  const parsed = acceptanceActionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }
  const a = parsed.data

  if (a.action === "absagen") {
    const { data, error } = await supabase.rpc("cancel_construction_acceptance", {
      p_acceptance_id: aid,
      p_reason: a.reason,
    })
    if (error) {
      const mapped = acceptanceRpcErrorStatus(error.code)
      if (mapped) return apiError(mapped.code, error.message, mapped.status)
      return apiError("cancel_failed", error.message, 500)
    }
    return NextResponse.json({ acceptance: data })
  }

  const { data, error } = await supabase.rpc("record_construction_acceptance", {
    p_acceptance_id: aid,
    p_result: a.result,
    p_accepted_on: a.accepted_on ?? null,
    p_reason: a.reason ?? null,
    p_warranty_months: a.warranty_months ?? null,
    p_reservation_defect_ids: a.reservation_defect_ids ?? null,
    p_new_reservations: a.new_reservations ?? null,
    p_accept_despite_open_defects: a.accept_despite_open_defects ?? false,
  })

  if (error) {
    const mapped = acceptanceRpcErrorStatus(error.code)
    if (mapped) return apiError(mapped.code, error.message, mapped.status)
    return apiError("record_failed", error.message, 500)
  }

  return NextResponse.json({ acceptance: data })
}
