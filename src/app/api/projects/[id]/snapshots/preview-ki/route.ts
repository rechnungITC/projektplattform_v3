import { NextResponse } from "next/server"
import { z } from "zod"

import { buildNarrativeAutoContext } from "@/lib/ai/auto-context"
import { invokeNarrativeGeneration } from "@/lib/ai/router"
import type { PreviewKiResponse } from "@/lib/reports/types"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-21 § ST-06 + PROJ-30 — KI-Narrative preview.
//
// PROJ-30 replaced the V1 stub with a real router invocation:
//   1. Build a curated Class-1/2-only auto-context (no personenbezogene
//      Felder).
//   2. Invoke `invokeNarrativeGeneration` — runs Class-3 hardlock,
//      provider-selection, ki_runs audit, and falls back to deterministic
//      stub-text on provider error so the UI never sees a 5xx.
//   3. Surface `{ text, classification, provider }` to the frontend
//      modal, which lets the user edit before committing the snapshot.
//
// `tenant_settings.output_rendering_settings.ki_narrative_enabled` is
// the per-tenant feature flag; gated below.

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

  try {
    const context = await buildNarrativeAutoContext(
      supabase,
      projectId,
      body.kind,
    )
    const result = await invokeNarrativeGeneration({
      supabase,
      tenantId,
      projectId,
      actorUserId: userId,
      context,
    })

    if (result.status === "error") {
      console.warn(
        "[PROJ-30] narrative provider error",
        JSON.stringify({
          run_id: result.run_id,
          provider: result.provider,
          message: result.error_message,
        }),
      )
    }

    const response: PreviewKiResponse = {
      text: result.text,
      classification: result.classification,
      provider: result.provider,
    }
    return NextResponse.json(response)
  } catch (err) {
    // Last-resort fallback: even the router/builder couldn't run
    // (DB outage etc.). Return stub text so the UI never sees a 5xx.
    console.error(
      "[PROJ-30] preview-ki hard-fallback",
      err instanceof Error ? err.message : String(err),
    )
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
}
