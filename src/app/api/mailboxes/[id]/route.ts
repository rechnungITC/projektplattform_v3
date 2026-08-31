import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
  requireTenantMember,
} from "@/app/api/_lib/route-helpers"
import {
  MAILBOX_SELECT,
  encryptMailboxCredential,
  isEncryptionAvailable,
} from "@/lib/mailboxes/credentials"
import { validateMailboxHost } from "@/lib/mailboxes/validation"

import { UpdateMailboxSchema } from "../_schema"

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * PROJ-158-α — PATCH und DELETE eines eigenen Postfachs.
 *
 * Die Berechtigung entscheidet durchgaengig die RLS: ein fremdes Postfach ist
 * fuer den sitzungsgebundenen Client schlicht nicht vorhanden, weshalb hier
 * kein Eigentuemer-Vergleich in der Anwendung steht — er waere eine zweite
 * Wahrheit neben der Regel und koennte von ihr abweichen. Trifft die Aenderung
 * keine Zeile, antwortet die Route 404: nicht vorhanden und nicht sichtbar
 * sind fuer den Aufrufer dasselbe, und das ist Absicht (AC-158.5b).
 */
export async function PATCH(request: Request, ctx: Ctx) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }

  const parsed = UpdateMailboxSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path.join(".")
    )
  }
  const input = parsed.data

  // Host oder Port geaendert? Dann erneut pruefen — sonst waere die
  // Adresspruefung durch ein spaeteres Aendern umgehbar.
  if (input.imap_host !== undefined || input.imap_port !== undefined) {
    const { data: current } = await supabase
      .from("user_mailboxes")
      .select("imap_host, imap_port")
      .eq("id", id)
      .maybeSingle()
    if (!current) return apiError("not_found", "Postfach nicht gefunden.", 404)

    const host = input.imap_host ?? (current.imap_host as string)
    const port = input.imap_port ?? (current.imap_port as number)
    const check = validateMailboxHost(host, port)
    if (!check.ok) {
      return apiError("invalid_host", check.code ?? "invalid_host", 422, "imap_host")
    }
  }

  const patch: Record<string, unknown> = {}
  for (const f of ["label", "imap_host", "imap_port", "imap_security", "imap_username"] as const) {
    if (input[f] !== undefined) patch[f] = input[f]
  }

  if (input.password !== undefined) {
    if (!isEncryptionAvailable()) {
      return apiError(
        "encryption_unavailable",
        "Der Server kann Zugangsdaten derzeit nicht verschlüsselt ablegen.",
        503
      )
    }
    try {
      patch.credential_encrypted = await encryptMailboxCredential(supabase, {
        password: input.password,
      })
    } catch {
      return apiError("encryption_failed", "Zugangsdaten konnten nicht abgelegt werden.", 500)
    }
  }

  // Jede Aenderung an Verbindungsdaten entwertet das letzte Pruefergebnis —
  // sonst behauptete die Flaeche „verbunden" fuer eine Anbindung, die so nie
  // geprueft wurde (Edge Case der Spec).
  const touchesConnection = Object.keys(patch).some((k) => k !== "label")
  if (touchesConnection) {
    patch.status = "unchecked"
    patch.last_checked_at = null
    patch.last_error_code = null
  }

  const { data, error } = await supabase
    .from("user_mailboxes")
    .update(patch)
    .eq("id", id)
    .select(MAILBOX_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "23505") {
      return apiError("duplicate_mailbox", "Name oder Postfach bereits vergeben.", 409)
    }
    return apiError("update_failed", "Postfach konnte nicht geändert werden.", 500)
  }
  if (!data) return apiError("not_found", "Postfach nicht gefunden.", 404)

  return NextResponse.json({ mailbox: data })
}

/**
 * DELETE — das Postfach und sein Geheimnis verschwinden gemeinsam, weil das
 * Geheimnis eine Spalte derselben Zeile ist. Es bleibt kein Rest zurueck
 * (AC-158.14, α-Teil: der Widerruf beim Anbieter kommt mit β).
 */
export async function DELETE(_request: Request, ctx: Ctx) {
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

  const { data, error } = await supabase
    .from("user_mailboxes")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle()

  if (error) {
    return apiError("delete_failed", "Postfach konnte nicht entfernt werden.", 500)
  }
  if (!data) return apiError("not_found", "Postfach nicht gefunden.", 404)

  return new NextResponse(null, { status: 204 })
}
