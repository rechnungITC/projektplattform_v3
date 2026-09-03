import { NextResponse } from "next/server"

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

import { CreateMailboxSchema } from "./_schema"

/**
 * PROJ-158-α — GET /api/mailboxes
 *
 * Die Postfaecher des Aufrufers. Nutzer-privat: die RLS-Regel laesst
 * ausschliesslich eigene Zeilen durch — auch die Mandanten-Administration
 * sieht hier nichts Fremdes (AC-158.5b, live belegt). Der `user_id`-Filter
 * ist Guertel zum Hosentraeger, nicht der Schutz selbst.
 *
 * `credential_encrypted` steht nicht in der Auswahl: das Geheimnis verlaesst
 * die Anwendung nie, auch nicht verschluesselt (AC-158.2).
 */
export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("no_active_tenant", "No active tenant.", 403)

  const memberDenied = await requireTenantMember(supabase, tenantId, userId)
  if (memberDenied) return memberDenied

  const { data, error } = await supabase
    .from("user_mailboxes")
    .select(MAILBOX_SELECT)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error) {
    return apiError("list_failed", "Postfächer konnten nicht geladen werden.", 500)
  }
  return NextResponse.json({ mailboxes: data ?? [] })
}

/**
 * POST /api/mailboxes — ein Postfach anbinden.
 *
 * Der Eintrag entsteht im Zustand `unchecked`; die Verbindungspruefung ist ein
 * zweiter, ausdruecklicher Schritt (Nutzer-Entscheid). Damit haengt das
 * Anlegen nicht an der Erreichbarkeit eines fremden Servers.
 */
export async function POST(request: Request) {
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

  const parsed = CreateMailboxSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    // `provider_not_available_yet` ist kein Eingabefehler des Nutzers, sondern
    // eine Grenze dieser Slice — eigener Code, damit die Oberflaeche „kommt mit
    // der naechsten Ausbaustufe" sagen kann statt „ungueltige Eingabe".
    if (first?.message === "provider_not_available_yet") {
      return apiError(
        "provider_not_available_yet",
        "Microsoft 365 und Gmail folgen in der nächsten Ausbaustufe. Aktuell ist ein eigener IMAP-Server möglich.",
        422,
        "provider"
      )
    }
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path.join(".")
    )
  }
  const input = parsed.data

  const hostCheck = validateMailboxHost(input.imap_host!, input.imap_port!)
  if (!hostCheck.ok) {
    return apiError("invalid_host", hostCheck.code ?? "invalid_host", 422, "imap_host")
  }

  if (!isEncryptionAvailable()) {
    return apiError(
      "encryption_unavailable",
      "Der Server kann Zugangsdaten derzeit nicht verschlüsselt ablegen.",
      503
    )
  }

  let encrypted: string
  try {
    encrypted = await encryptMailboxCredential(supabase, {
      password: input.password!,
    })
  } catch {
    return apiError("encryption_failed", "Zugangsdaten konnten nicht abgelegt werden.", 500)
  }

  const { data, error } = await supabase
    .from("user_mailboxes")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      label: input.label,
      provider: input.provider,
      imap_host: input.imap_host,
      imap_port: input.imap_port,
      imap_security: input.imap_security,
      imap_username: input.imap_username,
      credential_encrypted: encrypted,
      status: "unchecked",
    })
    .select(MAILBOX_SELECT)
    .single()

  if (error) {
    // 23505 trifft beide Eindeutigkeiten: gleicher Name, oder dasselbe
    // Postfach ein zweites Mal (Edge Case der Spec).
    if (error.code === "23505") {
      return apiError(
        "duplicate_mailbox",
        "Dieses Postfach oder dieser Name ist bereits angebunden.",
        409
      )
    }
    return apiError("create_failed", "Postfach konnte nicht angelegt werden.", 500)
  }

  return NextResponse.json({ mailbox: data }, { status: 201 })
}
