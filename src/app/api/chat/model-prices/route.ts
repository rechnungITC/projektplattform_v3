/**
 * PROJ-151-α — Modellpreise (AC-151.21).
 *
 * Lesen darf jedes Mitglied — die Kosten stehen an der eigenen Unterhaltung
 * und wären ohne Preis nicht erklärbar. Pflegen darf nur die Administration;
 * das entscheidet die Zugriffsregel.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const UpsertSchema = z.object({
  provider: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(120),
  input_per_1m: z.number().nonnegative(),
  output_per_1m: z.number().nonnegative(),
  currency: z.string().trim().length(3).default("EUR"),
})

export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("not_found", "No active tenant.", 404)
  const gate = await requireModuleActive(supabase, tenantId, "ai_chat")
  if (gate) return gate

  const { data, error } = await supabase
    .from("ai_model_prices")
    .select("id, provider, model, input_per_1m, output_per_1m, currency, updated_at")
    .order("provider", { ascending: true })

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ prices: data ?? [] })
}

export async function PUT(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) return apiError("not_found", "No active tenant.", 404)
  const gate = await requireModuleActive(supabase, tenantId, "ai_chat", { intent: "write" })
  if (gate) return gate

  const parsed = UpsertSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError("validation_error", "Invalid body.", 422)

  const { data, error } = await supabase
    .from("ai_model_prices")
    .upsert(
      { tenant_id: tenantId, ...parsed.data },
      { onConflict: "tenant_id,provider,model" },
    )
    .select("id, provider, model, input_per_1m, output_per_1m, currency, updated_at")
    .single()

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Tenant admin role required.", 403)
    }
    return apiError("internal_error", error.message, 500)
  }
  return NextResponse.json({ price: data })
}
