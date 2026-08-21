import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import type { ConstructionScheduleSignals } from "@/types/construction-signals"

// PROJ-45-δ — GET /api/projects/[id]/construction-schedule-signals
//
// Rein lesende Auswertung: Gewerk-Signale, Abschnittsfortschritt, nächste
// Fristen und überfällige Mängel in EINER Abfrage mit EINEM Zeitbezug (D-δ1).
//
// `construction_schedule_signals` ist SECURITY INVOKER — die Aggregate werden
// unter der RLS des Aufrufers gerechnet, ein Zähler kann also nichts verraten,
// dessen Zeilen verborgen sind. Genau deshalb MUSS hier der sitzungsgebundene
// Client rufen; ein Service-Role-Aufruf wäre ein Aggregat-Leck (Hausregel
// „Aggregates leak", vgl. AC-45βH-1).
//
// Gate-Reihenfolge wie in jeder Bau-Route: Kennung → Sitzung → Projektzugriff →
// Modul. Das Modul-Tor kommt zuletzt, weil erst der Projektzugriff die
// Mandanten-Kennung liefert. Lese-Absicht ⇒ 404 bei inaktivem Modul (Default
// `intent: "read"`), damit die Fläche ihre Existenz nicht verrät.
//
// `view` genügt: δ schreibt nichts, ein verschärftes Rollen-Gate wäre hier eine
// Behauptung ohne Gegenstand (AC-45δ.23).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("invalid_id", "Malformed project id.", 400, "id")
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

  const { data, error } = await supabase.rpc("construction_schedule_signals", {
    p_project_id: projectId,
  })
  if (error) return apiError("signals_failed", error.message, 500)

  return NextResponse.json({
    signals: (data as ConstructionScheduleSignals | null) ?? null,
  })
}
