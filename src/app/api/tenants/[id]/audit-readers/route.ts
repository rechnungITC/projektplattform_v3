import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireTenantAdmin,
} from "../../../_lib/route-helpers"

/**
 * PROJ-130-γ2 — Verwaltung der Revisions-Leseberechtigung.
 *
 * Vergabe und Widerruf laufen ausschließlich über die SECURITY-DEFINER-RPCs
 * `grant_audit_reader` / `revoke_audit_reader`; die Tabelle
 * `audit_reader_grants` hat bewusst keine schreibenden RLS-Policies. Die
 * Admin-Prüfung sitzt zusätzlich in den RPCs selbst — der Gate hier liefert nur
 * den saubereren 403, statt einen Postgres-Fehler durchzureichen.
 *
 * GET listet die Freigaben des Mandanten (RLS: Admins sehen alle, ein
 * Freigegebener seine eigene).
 */

const grantSchema = z.object({
  user_id: z.string().uuid("user_id muss eine UUID sein"),
  valid_until: z.string().datetime({ offset: true }).nullish(),
  note: z.string().max(500, "Notiz darf höchstens 500 Zeichen haben").nullish(),
})

const revokeSchema = z.object({
  user_id: z.string().uuid("user_id muss eine UUID sein"),
})

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

  const { data, error } = await supabase
    .from("audit_reader_grants")
    .select(
      "id, tenant_id, user_id, scope, valid_from, valid_until, note, granted_by, granted_at"
    )
    .eq("tenant_id", tenantId)
    .order("granted_at", { ascending: false })

  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({ grants: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params
  if (!z.string().uuid().safeParse(tenantId).success) {
    return apiError("validation_error", "Ungültige Mandanten-ID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const adminError = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminError) return adminError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Body ist kein gültiges JSON.", 400)
  }

  const parsed = grantSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Ungültige Eingabe.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("grant_audit_reader", {
    p_tenant_id: tenantId,
    p_user_id: parsed.data.user_id,
    p_valid_until: parsed.data.valid_until ?? null,
    p_note: parsed.data.note ?? null,
  })

  if (error) {
    // Die RPC wirft 42501 für Nicht-Admins und 22023/23503 für schlechte Eingaben.
    const status = error.code === "42501" ? 403 : 400
    return apiError("grant_failed", error.message, status)
  }

  return NextResponse.json({ grant_id: data }, { status: 201 })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tenantId } = await params
  if (!z.string().uuid().safeParse(tenantId).success) {
    return apiError("validation_error", "Ungültige Mandanten-ID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const adminError = await requireTenantAdmin(supabase, tenantId, userId)
  if (adminError) return adminError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Body ist kein gültiges JSON.", 400)
  }

  const parsed = revokeSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Ungültige Eingabe.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("revoke_audit_reader", {
    p_tenant_id: tenantId,
    p_user_id: parsed.data.user_id,
  })

  if (error) {
    const status = error.code === "42501" ? 403 : 400
    return apiError("revoke_failed", error.message, status)
  }

  return NextResponse.json({ revoked: data === true })
}
