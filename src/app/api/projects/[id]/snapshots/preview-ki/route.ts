import { NextResponse } from "next/server"
import { z } from "zod"

import type { PreviewKiResponse } from "@/lib/reports/types"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-21 § ST-06 — KI-Narrative preview.
//
// V1 deviation: the existing PROJ-12 AI router (lib/ai/router.ts) is
// purpose-typed for "risks" and does not yet implement a "narrative"
// purpose. Wiring the narrative path through the router (Class-3
// routing → local provider, fallback handling, ki_runs row, audit) is
// a substantive PROJ-12 extension. Until that lands, this route
// returns a graceful fallback: a templated 3-sentence narrative with
// classification=2 and provider="stub". The frontend's KI modal
// already lets the user edit the text before committing, so the UX is
// correct — only the auto-generated content is a stub.
//
// Tracked in PROJ-21 implementation notes as a deviation; once the
// narrative purpose lands in the AI router, replace the stub with
// `invokeNarrativeGeneration({...})`.

const previewSchema = z.object({
  kind: z.enum(["status_report", "executive_summary"]),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error
  const tenantId = (access.project as { tenant_id: string }).tenant_id

  const moduleErr = await requireModuleActive(
    supabase,
    tenantId,
    "output_rendering",
    { intent: "write" },
  )
  if (moduleErr) return moduleErr

  // Honour the per-tenant feature flag — the route is callable only
  // when ki_narrative_enabled is true.
  const { data: settings } = await supabase
    .from("tenant_settings")
    .select("output_rendering_settings")
    .eq("tenant_id", tenantId)
    .maybeSingle<{
      output_rendering_settings: { ki_narrative_enabled?: boolean } | null
    }>()
  const enabled =
    settings?.output_rendering_settings?.ki_narrative_enabled === true
  if (!enabled) {
    return apiError(
      "ki_narrative_disabled",
      "KI narrative is disabled for this tenant.",
      403,
    )
  }

  let body: z.infer<typeof previewSchema>
  try {
    body = previewSchema.parse(await request.json())
  } catch (err) {
    return apiError(
      "invalid_request",
      err instanceof Error ? err.message : "Invalid body",
      400,
    )
  }

  // V1 stub — see route header. Replace with router call once
  // narrative purpose lands in PROJ-12.
  const fallbackText =
    body.kind === "status_report"
      ? "Das Projekt befindet sich in der laufenden Umsetzung. Die wichtigsten Risiken sind aktiv betreut, die nächsten Meilensteine sind terminlich auf Kurs. Im nächsten Lenkungskreis stehen Phasenfreigabe und Budget-Status auf der Agenda."
      : "Das Projekt liegt im Plan. Top-Risiken sind unter Beobachtung. Nächster Meilenstein steht termingerecht."

  const response: PreviewKiResponse = {
    text: fallbackText,
    classification: 2,
    provider: "stub",
  }
  return NextResponse.json(response)
}
