/**
 * PROJ-151-α — Prompt-Vorlagen, mandantenweit (AC-151.18/.19).
 *
 * Lesen darf jedes Mitglied (nur aktive), pflegen nur die Administration — das
 * entscheidet die Zugriffsregel, nicht dieser Code. Favoriten sind privat.
 *
 * Geliefert wird die STRUKTUR. Die Inhalte der U-Know-Bibliothek liegen nicht
 * im Code (0 geseedete Zeilen in 92 Migrationen) — sie sind Betriebsdaten der
 * fremden Instanz und bräuchten einen Export des Eigners.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(8000),
})

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("not_found", "No active tenant.", 404)
  const gate = await requireModuleActive(supabase, tenantId, "ai_chat")
  if (gate) return gate

  const [templatesRes, favoritesRes] = await Promise.all([
    supabase
      .from("ai_chat_prompt_templates")
      .select("id, title, body, is_active, created_at")
      .order("title", { ascending: true }),
    supabase.from("ai_chat_prompt_favorites").select("template_id"),
  ])

  if (templatesRes.error) return apiError("internal_error", templatesRes.error.message, 500)

  const favorites = new Set(
    (favoritesRes.data ?? []).map((f) => f.template_id as string),
  )

  // Favoriten zuerst (AC-151.19) — sortiert wird hier, nicht in der Datenbank:
  // "ist Favorit" ist je Nutzer verschieden und gehört nicht in den Index.
  const templates = (templatesRes.data ?? [])
    .map((t) => ({ ...t, is_favorite: favorites.has(t.id as string) }))
    .sort((a, b) =>
      a.is_favorite === b.is_favorite
        ? String(a.title).localeCompare(String(b.title), "de")
        : a.is_favorite
          ? -1
          : 1,
    )

  return NextResponse.json({ templates })
}

export async function POST(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("not_found", "No active tenant.", 404)
  const gate = await requireModuleActive(supabase, tenantId, "ai_chat", { intent: "write" })
  if (gate) return gate

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError("validation_error", "Invalid body.", 422)

  // Kein Admin-Check im Code: die Schreib-Regel prüft `is_tenant_admin`. Ein
  // zweiter Check hier wäre eine zweite Wahrheit, die auseinanderlaufen kann.
  const { data, error } = await supabase
    .from("ai_chat_prompt_templates")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      body: parsed.data.body,
      created_by: userId,
    })
    .select("id, title, body, is_active, created_at")
    .single()

  if (error) {
    // 42501 = die Regel hat abgelehnt (kein Admin). Kein 500 daraus machen.
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    return apiError("internal_error", error.message, 500)
  }
  return NextResponse.json({ template: data }, { status: 201 })
}
