import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import { runMailboxCheck } from "@/lib/mailboxes/connection-test"
import {
  MAILBOX_SELECT,
  decryptMailboxCredential,
} from "@/lib/mailboxes/credentials"
import type { MailboxSecurity } from "@/lib/mailboxes/validation"

interface Ctx {
  params: Promise<{ id: string }>
}

/** Pruefergebnis → gespeicherter Zustand. `timeout` faellt bewusst auf
 *  `unreachable`: fuer den Nutzer ist beides „der Server antwortet nicht". */
const STATUS_BY_CODE: Record<string, string> = {
  connected: "connected",
  auth_failed: "auth_failed",
  unreachable: "unreachable",
  timeout: "unreachable",
  mailbox_disabled: "mailbox_disabled",
  error: "error",
}

/**
 * PROJ-158-α — POST /api/mailboxes/[id]/test
 *
 * Verbindet, meldet sich an, liest das Ordnerverzeichnis, meldet sich ab.
 * **Keine Nachricht wird gelesen** — die Zusage aus AC-158.7 wird in
 * `connection-test.ts` strukturell eingeloest und dort auch getestet.
 *
 * Das Geheimnis wird ueber den sitzungsgebundenen Client geholt: damit hat die
 * RLS bereits entschieden, dass es das eigene Postfach ist. Ein fremdes
 * Postfach liefert hier gar keine Zeile und endet als 404 — nicht vorhanden
 * und nicht sichtbar sind fuer den Aufrufer dasselbe.
 */
export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid mailbox id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("no_active_tenant", "No active tenant.", 403)

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const { data: row, error: readErr } = await supabase
    .from("user_mailboxes")
    // `credential_encrypted` steht hier NICHT mehr: die Entschluesselung
    // geschieht seit PROJ-Y-158a in der Datenbank, der Chiffretext verlaesst
    // sie gar nicht erst.
    .select("id, provider, imap_host, imap_port, imap_security, imap_username")
    .eq("id", id)
    .maybeSingle()

  if (readErr) return apiError("read_failed", "Postfach konnte nicht gelesen werden.", 500)
  if (!row) return apiError("not_found", "Postfach nicht gefunden.", 404)

  if (row.provider !== "imap") {
    return apiError(
      "provider_not_available_yet",
      "Die Prüfung für Microsoft 365 und Gmail folgt in der nächsten Ausbaustufe.",
      422
    )
  }

  // Uebergeben wird die Kennung; die Datenbankfunktion ist SECURITY INVOKER
  // und liest die Zeile unter der RLS des Aufrufers (PROJ-Y-158a).
  const credential = await decryptMailboxCredential(supabase, id)
  if (!credential.ok) {
    // Die Gruende fuehren zu verschiedenen naechsten Schritten und werden
    // deshalb nicht in eine Meldung zusammengezogen. Die Vorfassung riet in
    // jedem Fall zum erneuten Speichern — bei „nicht sichtbar" ein Rat, der
    // nichts bewirkt.
    switch (credential.reason) {
      case "not_found":
        return apiError("not_found", "Postfach nicht gefunden.", 404)
      case "no_credential":
        return apiError(
          "credential_missing",
          "Für dieses Postfach ist kein Passwort hinterlegt. Bitte erneut speichern.",
          422
        )
      case "encryption_unavailable":
        return apiError(
          "encryption_unavailable",
          "Der Server kann Zugangsdaten derzeit nicht entschlüsseln.",
          503
        )
      default:
        return apiError(
          "credential_unavailable",
          "Die hinterlegten Zugangsdaten konnten nicht gelesen werden.",
          503
        )
    }
  }

  const result = await runMailboxCheck({
    host: row.imap_host as string,
    port: row.imap_port as number,
    security: row.imap_security as MailboxSecurity,
    username: row.imap_username as string,
    password: credential.credential.password,
  })

  const status = STATUS_BY_CODE[result.code] ?? "error"

  const { data: updated } = await supabase
    .from("user_mailboxes")
    .update({
      status,
      last_checked_at: new Date().toISOString(),
      // Bei Erfolg wird der alte Grund geloescht — sonst bliebe ein
      // widerlegter Fehler neben einem gruenen Zustand stehen.
      last_error_code: result.code === "connected" ? null : result.code,
    })
    .eq("id", id)
    .select(MAILBOX_SELECT)
    .maybeSingle()

  return NextResponse.json({
    // Der Grund ist eine stabile Kennung, kein Fremdtext (AC-158.9).
    result: result.code,
    folder_count: result.folderCount ?? null,
    mailbox: updated ?? null,
  })
}
