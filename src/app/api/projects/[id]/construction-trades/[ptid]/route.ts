import { NextResponse } from "next/server"
import { z } from "zod"

import {
  buildBlockingMessage,
  parseBlockingRefs,
} from "@/lib/construction/blocking-refs"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"
import { PROJECT_TRADE_SELECT } from "../route"

// PROJ-45-α — one project trade: responsibility, subcontractor, traffic light.
// The traffic light is only ever set here, never derived (lock L8).

const idSchema = z.string().uuid()

const patchSchema = z
  .object({
    responsible_user_id: z.string().uuid().nullable().optional(),
    vendor_id: z.string().uuid().nullable().optional(),
    rag_status: z.enum(["gruen", "gelb", "rot"]).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    sort_order: z.number().int().min(0).max(100000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })

async function gate(projectId: string, ptid: string) {
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(ptid).success) {
    return { error: apiError("invalid_id", "Malformed id.", 400) }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return { error: apiError("unauthorized", "Not signed in.", 401) }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return { error: access.error }

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "construction",
    { intent: "write" }
  )
  if (moduleDenial) return { error: moduleDenial }

  return { supabase }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; ptid: string }> }
) {
  const { id: projectId, ptid } = await params
  const gated = await gate(projectId, ptid)
  if (gated.error) return gated.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return apiError("validation_failed", parsed.error.issues[0].message, 422)
  }

  const { data, error } = await gated.supabase
    .from("project_construction_trades")
    .update(parsed.data)
    .eq("id", ptid)
    .eq("project_id", projectId)
    .select(PROJECT_TRADE_SELECT)
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    if (error.code === "23503") return apiError("invalid_reference", error.message, 422)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Trade assignment not found.", 404)

  return NextResponse.json({ trade: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; ptid: string }> }
) {
  const { id: projectId, ptid } = await params
  const gated = await gate(projectId, ptid)
  if (gated.error) return gated.error

  // Work items and risks referencing this row keep existing; their reference
  // falls back to NULL through ON DELETE SET NULL (AC-45.22).
  const { error } = await gated.supabase
    .from("project_construction_trades")
    .delete()
    .eq("id", ptid)
    .eq("project_id", projectId)

  if (error) {
    if (error.code === "23503") {
      // PROJ-45-β/γ (AC-45βH-7 / AC-45γ.27): der Bezug wird ohne
      // `on delete`-Klausel gehalten, weil das Gewerk die Zuständigkeit trägt,
      // die eine Mängelanzeige und ein Abnahmeprotokoll brauchen (L16).
      //
      // GENERALISIERT in γ: bis dahin sprach dieser Zweig wörtlich von Mängeln
      // (Code `defects_present`). Sobald auch eine ABNAHME blockiert, wäre die
      // Meldung FALSCH gewesen, nicht bloss unvollständig. Die INVOKER-Auskunft
      // nennt jetzt Art UND Bezeichnung; sie läuft im Recht des Aufrufers und
      // benennt darum nie ein Objekt, das er ohnehin nicht sehen darf.
      const { data: blocking } = await gated.supabase.rpc(
        "construction_trade_blocking_refs",
        { p_trade_id: ptid }
      )

      return apiError(
        "references_present",
        buildBlockingMessage("Gewerk", parseBlockingRefs(blocking)),
        409
      )
    }
    if (error.code === "42501") return apiError("forbidden", "Not allowed.", 403)
    return apiError("delete_failed", error.message, 500)
  }

  return NextResponse.json({ ok: true })
}
