import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

import { createValuationLinkSchema, VALUATION_LINK_SELECT } from "../../_schema"

// PROJ-120 — Verknüpfungen einer Bewertungsversion (AC3).
//
// GET    → Links der Version. Die SELECT-Policy ist BEIDSEITIG gegated: sichtbar
//          nur, wenn der Aufrufer sowohl für die Bewertung als auch für das
//          verknüpfte Objekt freigegeben ist (AC-120-H2) — sonst wäre die
//          Existenz eines strict-Findings über den Link inferierbar.
// POST   → set_ma_valuation_link (idempotent; prüft Rolle, beide Clearances und
//          dass das Ziel zum selben Projekt gehört).
// DELETE → remove_ma_valuation_link (?linkId=…).

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; vid: string }> }
) {
  const { id: projectId, vid } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(vid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase
    .from("ma_valuation_links")
    .select(VALUATION_LINK_SELECT)
    .eq("valuation_id", vid)
    .order("created_at", { ascending: true })
    .limit(500)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ links: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; vid: string }> }
) {
  const { id: projectId, vid } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(vid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
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
  const parsed = createValuationLinkSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { data, error } = await supabase.rpc("set_ma_valuation_link", {
    p_valuation_id: vid,
    p_linked_kind: parsed.data.linked_kind,
    p_linked_id: parsed.data.linked_id,
    p_note: parsed.data.note ?? undefined,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "P0002") return apiError("not_found", "Valuation not found.", 404)
    if (error.code === "23503") {
      return apiError("validation_error", "Link target not found.", 400)
    }
    if (error.code === "23514") {
      return apiError("constraint_violation", error.message, 422)
    }
    if (error.code === "22023") {
      return apiError("validation_error", error.message, 400)
    }
    return apiError("link_failed", error.message, 500)
  }

  return NextResponse.json({ link: data }, { status: 201 })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; vid: string }> }
) {
  const { id: projectId, vid } = await context.params
  const linkId = new URL(request.url).searchParams.get("linkId") ?? ""
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(vid).success ||
    !z.string().uuid().safeParse(linkId).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { error } = await supabase.rpc("remove_ma_valuation_link", {
    p_link_id: linkId,
  })

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "P0002") return apiError("not_found", "Link not found.", 404)
    return apiError("unlink_failed", error.message, 500)
  }

  return NextResponse.json({ ok: true })
}
