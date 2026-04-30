import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireModuleActive } from "@/lib/tenant-settings/server"

// POST /api/projects/[id]/budget/postings/[pid]/reverse
//   Storno einer Buchung. Erzeugt eine neue Buchung mit kind='reversal',
//   amount = -original.amount, reverses_posting_id = original.id.
//   Schreibt einen synthetischen audit-Eintrag mit change_reason='Buchung storniert'.
//   UNIQUE(reverses_posting_id) auf budget_postings verhindert Doppel-Storno
//   (auch bei Race-Conditions zwischen zwei Editor-Sessions).
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: postingId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(postingId).success) {
    return apiError("validation_error", "Invalid posting id.", 400, "pid")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data: original, error: lookupErr } = await supabase
    .from("budget_postings")
    .select("*")
    .eq("id", postingId)
    .eq("project_id", projectId)
    .maybeSingle()
  if (lookupErr) return apiError("internal_error", lookupErr.message, 500)
  if (!original) return apiError("not_found", "Posting not found.", 404)

  const moduleDenial = await requireModuleActive(
    supabase,
    original.tenant_id,
    "budget",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  if (original.kind === "reversal") {
    return apiError(
      "cannot_reverse_reversal",
      "Eine Storno-Buchung kann nicht erneut storniert werden.",
      422
    )
  }

  const { data: reversal, error: insertErr } = await supabase
    .from("budget_postings")
    .insert({
      tenant_id: original.tenant_id,
      project_id: projectId,
      item_id: original.item_id,
      kind: "reversal",
      amount: -original.amount,
      currency: original.currency,
      posted_at: new Date().toISOString().slice(0, 10),
      note: `Storno von ${original.id}`,
      source: original.source,
      source_ref_id: original.source_ref_id,
      reverses_posting_id: original.id,
      created_by: userId,
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "23505") {
      return apiError(
        "already_reversed",
        "Diese Buchung wurde bereits storniert.",
        409
      )
    }
    if (insertErr.code === "42501") return apiError("forbidden", "Editor role required.", 403)
    if (insertErr.code === "23514") return apiError("constraint_violation", insertErr.message, 422)
    return apiError("reverse_failed", insertErr.message, 500)
  }

  try {
    const admin = createAdminClient()
    await admin.from("audit_log_entries").insert({
      tenant_id: original.tenant_id,
      entity_type: "budget_postings",
      entity_id: reversal.id,
      field_name: "posting_reversed",
      old_value: { original_posting_id: original.id, amount: original.amount },
      new_value: { reversal_amount: -original.amount },
      actor_user_id: userId,
      change_reason: "Buchung storniert",
    })
  } catch {
    // Non-fatal — reversal is already committed.
  }

  return NextResponse.json({ reversal }, { status: 201 })
}
