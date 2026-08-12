import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
} from "../../../_lib/route-helpers"

/**
 * PROJ-130-ε — Verifikationslauf über die Audit-Prüfwert-Kette.
 *
 * GET /api/tenants/[id]/audit-chain
 *
 * Rechnet jeden gesiegelten Anker nach und meldet zwei Dinge getrennt:
 *   - `digest_ok`  — der INHALT des Fensters ist unverändert
 *   - `link_ok`    — der ANKER selbst ist unverändert und hängt am Vorgänger
 *
 * Die Trennung ist der Kern: eine Fälschung am Trail bricht `digest_ok`; wer sie
 * durch Nachziehen des Ankers verdecken will, bricht `link_ok`. Beides zusammen
 * lässt sich nur durch Nachziehen der GESAMTEN Folgekette verdecken.
 *
 * Die Berechtigung prüft die RPC selbst (Mandanten-Admin oder Revisions-Freigabe
 * aus γ2) — hier wird sie NICHT ein zweites Mal formuliert, damit es nicht zwei
 * Wahrheiten gibt. Die RPC ist SECURITY DEFINER, weil die Prüfung alle Zeilen
 * sehen muss; sie gibt ausschließlich Zahlen und Urteile zurück, nie Inhalte.
 */

interface VerifyRow {
  /** PROJ-Y-130n: `audit_log` (Änderungs-Trail) oder `confidential_read` (Zugriffsprotokoll). */
  source: string
  window_start: string
  entry_count_sealed: number
  entry_count_now: number
  digest_ok: boolean
  link_ok: boolean
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params
  if (!z.string().uuid().safeParse(tenantId).success) {
    return apiError("validation_error", "Ungültige Mandanten-ID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase.rpc("verify_audit_chain", {
    p_tenant_id: tenantId,
  })

  if (error) {
    // 42501 kommt aus dem Gate der RPC (kein Admin, keine Revisions-Freigabe).
    if (error.code === "42501") {
      return apiError(
        "forbidden",
        "Die Prüfung des Audit-Trails ist der Mandanten-Administration und Personen mit Revisions-Freigabe vorbehalten.",
        403
      )
    }
    return apiError("verify_failed", error.message, 500)
  }

  const windows = (data ?? []) as VerifyRow[]
  const broken = windows.filter((w) => !w.digest_ok || !w.link_ok)

  // PROJ-Y-130n: seit die Kette zwei Quellen hat (Änderungs-Trail und
  // Zugriffsprotokoll), muss das Urteil je Kette lesbar sein. Ein
  // zusammengefasstes „intakt" würde verschweigen, WELCHES Protokoll betroffen ist.
  const bySource = new Map<string, VerifyRow[]>()
  for (const w of windows) {
    const list = bySource.get(w.source) ?? []
    list.push(w)
    bySource.set(w.source, list)
  }

  return NextResponse.json({
    windows_checked: windows.length,
    intact: broken.length === 0,
    // Bewusst nur die auffälligen Fenster im Detail: eine Liste aller Tage wäre
    // für einen Prüfer Rauschen, und das Urteil ist die Aussage, nicht die Menge.
    findings: broken,
    last_window_start: windows.at(-1)?.window_start ?? null,
    sources: Array.from(bySource.entries()).map(([source, rows]) => ({
      source,
      windows_checked: rows.length,
      intact: rows.every((w) => w.digest_ok && w.link_ok),
      last_window_start: rows.at(-1)?.window_start ?? null,
    })),
  })
}
