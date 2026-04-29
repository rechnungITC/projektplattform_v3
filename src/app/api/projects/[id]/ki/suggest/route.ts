import { NextResponse } from "next/server"
import { z } from "zod"

import { collectRiskAutoContext } from "@/lib/ai/auto-context"
import { invokeRiskGeneration } from "@/lib/ai/router"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

// PROJ-12 — POST /api/projects/[id]/ki/suggest
// Body: { purpose: 'risks', count?: number }   (purpose=risks only in MVP)
//
// Generates AI-suggested risks for the project using the auto-context
// collector + router. Persists ki_runs + ki_suggestions; returns the run
// id, classification, provider used, and the new suggestion ids.

const bodySchema = z.object({
  purpose: z.enum(["risks"]),
  count: z.number().int().min(1).max(10).default(5),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params

  let body: unknown = {}
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json()
    } catch {
      // Empty/invalid body is fine; we'll use defaults.
      body = {}
    }
  }
  const parsed = bodySchema.safeParse({
    purpose: "risks",
    ...(typeof body === "object" && body !== null ? body : {}),
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "ai_proposals",
    { intent: "write" }
  )
  if (moduleDenial) return moduleDenial

  let context
  try {
    context = await collectRiskAutoContext(supabase, projectId)
  } catch (err) {
    return apiError(
      "context_failed",
      err instanceof Error ? err.message : "Failed to collect project context.",
      500
    )
  }

  const result = await invokeRiskGeneration({
    supabase,
    tenantId: access.project.tenant_id,
    projectId,
    actorUserId: userId,
    context,
    count: parsed.data.count,
  })

  if (result.status === "error") {
    return apiError(
      "ai_error",
      result.error_message ?? "AI generation failed.",
      502
    )
  }

  return NextResponse.json({
    run_id: result.run_id,
    classification: result.classification,
    provider: result.provider,
    model_id: result.model_id,
    status: result.status,
    suggestion_ids: result.suggestion_ids,
    external_blocked: result.external_blocked,
  })
}
