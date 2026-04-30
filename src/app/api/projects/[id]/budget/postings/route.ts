import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import { SUPPORTED_CURRENCIES } from "@/types/tenant-settings"

const createSchema = z.object({
  item_id: z.string().uuid(),
  kind: z.enum(["actual", "reservation"] as const),
  amount: z.number().nonnegative(),
  currency: z.enum(SUPPORTED_CURRENCIES as unknown as [string, ...string[]]),
  posted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required"),
  note: z.string().max(500).nullable().optional(),
  source_ref_id: z.string().uuid().nullable().optional(),
})

// GET /api/projects/[id]/budget/postings?item_id=...
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: proj } = await supabase
    .from("projects")
    .select("tenant_id")
    .eq("id", projectId)
    .maybeSingle()
  if (!proj) return apiError("not_found", "Project not found.", 404)
  const moduleDenial = await requireModuleActive(
    supabase,
    proj.tenant_id,
    "budget",
    { intent: "read" }
  )
  if (moduleDenial) return moduleDenial

  const url = new URL(request.url)
  const itemId = url.searchParams.get("item_id")

  let query = supabase
    .from("budget_postings")
    .select("*")
    .eq("project_id", projectId)
    .order("posted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (itemId) {
    if (!z.string().uuid().safeParse(itemId).success) {
      return apiError("validation_error", "Invalid item id.", 400, "item_id")
    }
    query = query.eq("item_id", itemId)
  }

  const { data, error } = await query
  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ postings: data ?? [] })
}

// POST /api/projects/[id]/budget/postings
//   Anlegen einer Buchung. Schreibt zusätzlich einen synthetischen
//   audit_log_entries-Eintrag mit change_reason='Buchung angelegt'
//   (PROJ-22 Architecture Decision 4).
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // Verify item belongs to project (defense-in-depth on top of FK)
  const { data: item, error: itemErr } = await supabase
    .from("budget_items")
    .select("id, project_id, tenant_id, is_active")
    .eq("id", parsed.data.item_id)
    .maybeSingle()
  if (itemErr) return apiError("internal_error", itemErr.message, 500)
  if (!item) return apiError("not_found", "Item not found.", 404)
  if (item.project_id !== projectId) {
    return apiError(
      "invalid_reference",
      "Item does not belong to this project.",
      422,
      "item_id"
    )
  }
  if (!item.is_active) {
    return apiError(
      "item_inactive",
      "Posten ist deaktiviert — keine Buchungen erlaubt.",
      422,
      "item_id"
    )
  }

  const moduleDenial = await requireModuleActive(
    supabase,
    item.tenant_id,
    "budget",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  const { data: posting, error: insertErr } = await supabase
    .from("budget_postings")
    .insert({
      tenant_id: item.tenant_id,
      project_id: projectId,
      item_id: parsed.data.item_id,
      kind: parsed.data.kind,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      posted_at: parsed.data.posted_at,
      note: parsed.data.note ?? null,
      source: parsed.data.source_ref_id ? "vendor_invoice" : "manual",
      source_ref_id: parsed.data.source_ref_id ?? null,
      reverses_posting_id: null,
      created_by: userId,
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (insertErr.code === "23514") return apiError("constraint_violation", insertErr.message, 422)
    if (insertErr.code === "23503") return apiError("invalid_reference", insertErr.message, 422)
    return apiError("create_failed", insertErr.message, 500)
  }

  // Synthetic audit entry. RLS on audit_log_entries only permits SELECT;
  // writes go through the service-role client.
  try {
    const admin = createAdminClient()
    await admin.from("audit_log_entries").insert({
      tenant_id: item.tenant_id,
      entity_type: "budget_postings",
      entity_id: posting.id,
      field_name: "posting_created",
      old_value: null,
      new_value: {
        kind: parsed.data.kind,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        posted_at: parsed.data.posted_at,
        source: parsed.data.source_ref_id ? "vendor_invoice" : "manual",
      },
      actor_user_id: userId,
      change_reason: "Buchung angelegt",
    })
  } catch {
    // Non-fatal — posting is already committed.
  }

  return NextResponse.json({ posting }, { status: 201 })
}
