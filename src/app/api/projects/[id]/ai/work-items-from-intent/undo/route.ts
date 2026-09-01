/**
 * PROJ-153-α — Rückgängig der Vorschläge aus dem Vorhaben.
 *
 *   POST /api/projects/[id]/ai/work-items-from-intent/undo
 *     Body: { suggestionIds: uuid[] }
 *
 * Die Route ist absichtlich dünn: Autorisierung, Modul-Tor, dann die
 * `SECURITY DEFINER`-Funktion. Sie schreibt **nichts selbst** — die Herkunft
 * (Lock L2) entsteht ausschliesslich in der Funktion, und genau das macht sie
 * unfälschbar. Eine Route, die hier selbst `work_items` anlegte, wäre ein
 * zweiter Schreibweg an der Herkunft vorbei.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../../_lib/route-helpers"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const bodySchema = z.object({
  suggestionIds: z.array(z.string().uuid()).min(1).max(100),
})

interface Ctx {
  params: Promise<{ id: string }>
}

/** Fehlercodes der Funktion auf sprechende HTTP-Antworten abbilden. */
function mapRpcError(message: string): { code: string; status: number } {
  if (message.includes("forbidden")) return { code: "forbidden", status: 403 }
  if (message.includes("project_not_found"))
    return { code: "not_found", status: 404 }
  if (message.includes("method_kind_incompatible"))
    return { code: "method_kind_incompatible", status: 422 }
  if (message.includes("some_suggestions_invalid_or_already_accepted"))
    return { code: "suggestions_not_acceptable", status: 409 }
  if (message.includes("parent_not_accepted"))
    return { code: "parent_not_accepted", status: 409 }
  if (message.includes("topological_sort_failed"))
    return { code: "hierarchy_unresolvable", status: 422 }
  if (message.includes("undo_window_expired") || message.includes("undo_invalid"))
    return { code: "undo_window_expired", status: 409 }
  if (message.includes("empty_suggestion_ids"))
    return { code: "validation_error", status: 400 }
  return { code: "rpc_failed", status: 500 }
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = bodySchema.safeParse(
    typeof body === "object" && body !== null ? body : {},
  )
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "ai_proposals",
    { intent: "write" },
  )
  if (moduleDenial) return moduleDenial

  const { data, error } = await supabase.rpc("accept_work_items_from_intent_undo", {
    p_project_id: projectId,
    p_suggestion_ids: parsed.data.suggestionIds,
  })

  if (error) {
    const mapped = mapRpcError(error.message)
    return apiError(mapped.code, error.message, mapped.status)
  }

  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json(row ?? {}, { status: 200 })
}
