import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import { resolvePhaseWarnings } from "@/lib/compliance/phase-warnings"
import { createAdminClient } from "@/lib/supabase/admin"

const transitionSchema = z.object({
  to_status: z.enum(["planned", "in_progress", "completed", "cancelled"]),
  comment: z.string().max(500).optional().nullable(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const { id: projectId, pid: phaseId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  if (!z.string().uuid().safeParse(phaseId).success) {
    return apiError("validation_error", "Invalid phase id.", 400, "pid")
  }

  let body: unknown
  try { body = await request.json() } catch { return apiError("invalid_body", "Body must be JSON.", 400) }
  const parsed = transitionSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError("validation_error", f?.message ?? "Invalid body.", 400, f?.path?.[0]?.toString())
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // PROJ-18: surface compliance warnings BEFORE the transition so callers
  // see what's open. Resolve only when closing the phase — other
  // transitions are out of scope for the gate-warning UI.
  const complianceWarnings =
    parsed.data.to_status === "completed"
      ? await resolvePhaseWarnings({ supabase, projectId, phaseId }).catch(
          () => []
        )
      : []

  const { data, error } = await supabase.rpc("transition_phase_status", {
    p_phase_id: phaseId,
    p_to_status: parsed.data.to_status,
    p_comment: parsed.data.comment ?? null,
  })

  if (error) {
    if (error.code === "23514") return apiError("invalid_transition", error.message, 422)
    if (error.code === "42501") return apiError("forbidden", error.message, 403)
    if (error.code === "02000") return apiError("not_found", "Phase not found.", 404)
    return apiError("transition_failed", error.message, 500)
  }

  // PROJ-18: when the phase was closed despite open compliance increments,
  // log an audit row so the closure is traceable. Best-effort — the
  // transition itself already succeeded.
  if (
    parsed.data.to_status === "completed" &&
    complianceWarnings.length > 0
  ) {
    const { data: phaseRow } = await supabase
      .from("phases")
      .select("tenant_id")
      .eq("id", phaseId)
      .maybeSingle()
    if (phaseRow) {
      // RLS on audit_log_entries only permits SELECT — writes go through
      // the service-role client.
      try {
        const admin = createAdminClient()
        await admin.from("audit_log_entries").insert({
          tenant_id: (phaseRow as { tenant_id: string }).tenant_id,
          entity_type: "phases",
          entity_id: phaseId,
          field_name: "compliance_close_warning",
          old_value: null,
          new_value: { warning_count: complianceWarnings.length },
          actor_user_id: userId,
          change_reason: `Phase closed despite ${complianceWarnings.length} open compliance increment(s)`,
        })
      } catch {
        // Best-effort — closure already succeeded.
      }
    }
  }

  return NextResponse.json({ ...data, compliance_warnings: complianceWarnings })
}
