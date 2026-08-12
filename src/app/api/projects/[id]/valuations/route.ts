import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  logConfidentialListRead,
  mustBlockOnLogFailure,
  STRICT_LOG_FAILED_MESSAGE,
} from "@/lib/audit/confidential-read"

import { createValuationVersionSchema, VALUATION_SELECT } from "./_schema"

// PROJ-120 — Bewertungsversionen eines Deals.
//
// GET  → die vollständige Versionskette (neueste zuerst). Der Eintrag mit
//        is_current ist die "Aktuelle Bewertungssicht" (AC4). RLS +
//        Need-to-know filtern serverseitig.
// POST → neue Version über die SECURITY-DEFINER-RPC add_ma_valuation_version
//        (atomarer is_current-Flip + INSERT). Die RPC prüft Rolle
//        (Tenant-Admin / Project-Lead) UND Clearance selbst → hier reicht
//        "view"; niemals der service-role-Client.

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("ma_valuations")
    .select(VALUATION_SELECT)
    .eq("project_id", projectId)
    .order("version_no", { ascending: false })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)

  // PROJ-130-δ2: In-App-Lesen einer Inhalts-Liste. Ein Eintrag entsteht NUR, wenn
  // `strict` dabei ist (und dann entprellt auf eine Zeile pro 15-Minuten-Fenster);
  // bei `standard`/`confidential` gibt es keinen zusätzlichen Datenbank-Aufruf.
  const readLog = await logConfidentialListRead(
    async (fn, args) => await supabase.rpc(fn, args),
    {
      projectId,
      entityType: "ma_valuations",
      rows: (data ?? []) as ReadonlyArray<{ confidentiality_level?: string | null }>,
    }
  )
  if (mustBlockOnLogFailure(readLog)) {
    return apiError("audit_log_failed", STRICT_LOG_FAILED_MESSAGE, 500)
  }

  return NextResponse.json({ valuations: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }
  const parsed = createValuationVersionSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("add_ma_valuation_version", {
    p_project_id: projectId,
    p_title: parsed.data.title,
    p_valuation_date: parsed.data.valuation_date,
    p_method: parsed.data.method,
    p_value_low: parsed.data.value_low ?? undefined,
    p_value_high: parsed.data.value_high ?? undefined,
    p_currency: parsed.data.currency ?? undefined,
    p_assumptions: parsed.data.assumptions ?? undefined,
    p_author_user_id: parsed.data.author_user_id ?? undefined,
    p_version_comment: parsed.data.version_comment ?? undefined,
    p_confidentiality_level: parsed.data.confidentiality_level ?? undefined,
    p_supersedes_valuation_id: parsed.data.supersedes_valuation_id ?? undefined,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "P0002") return apiError("not_found", "Project not found.", 404)
    if (error.code === "P0001") {
      return apiError(
        "validation_error",
        "Bewertungen gibt es nur für M&A-Projekte.",
        422
      )
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    if (error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("create_failed", error.message, 500)
  }

  return NextResponse.json({ valuation: data }, { status: 201 })
}
