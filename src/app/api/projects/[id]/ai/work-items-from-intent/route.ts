/**
 * PROJ-153-α — Arbeitspakete aus dem Vorhaben, ohne Kickoff-Datei.
 *
 *   POST /api/projects/[id]/ai/work-items-from-intent
 *     Body: { count?: 1–30 (Standard 15) }
 *     → Substanz-Tor, dann Generierung. **Kein `contextSourceId`** — das ist
 *       der ganze Unterschied zum Kickoff-Pfad.
 *
 *   GET  …?status=draft|accepted|rejected
 *     → listet die `ki_suggestions` dieses Zwecks, neueste zuerst.
 *
 * Auth: `edit` für POST, `view` für GET.
 *
 * **Warum die Absage des Substanz-Tors HTTP 200 ist und kein Fehler:** sie ist
 * der Normalfall (live 30 von 31 Projekten) und eine bewusste Entscheidung,
 * nicht zu generieren. Ein 4xx würde die Fläche zu einer Fehlerbehandlung
 * zwingen, wo eine Erklärung hingehört — und PROJ-137s Linie ist, dass ein
 * leeres Ergebnis erklärbar sein muss, nicht dass es wie ein Defekt aussieht.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { collectWorkItemsFromIntentContext } from "@/lib/ai/project-intent-context"
import { invokeWorkItemsFromIntentGeneration } from "@/lib/ai/router"
import { requireModuleActive } from "@/lib/tenant-settings/server"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../../_lib/route-helpers"

/**
 * PROJ-152 — Zeitbudget der Funktion. Ohne diesen Wert gilt die
 * Next.js-Voreinstellung, und die liegt unter dem Provider-Budget.
 */
export const maxDuration = 300

const SELECT_COLUMNS =
  "id, tenant_id, project_id, ki_run_id, purpose, payload, original_payload, " +
  "is_modified, status, accepted_entity_type, accepted_entity_id, " +
  "rejection_reason, created_by, created_at, updated_at, accepted_at, rejected_at"

const VALID_STATUSES = ["draft", "accepted", "rejected"] as const
const statusSchema = z.enum(VALID_STATUSES).optional()

const postBodySchema = z.object({
  count: z.number().int().min(1).max(30).default(15),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const moduleDenial = await requireModuleActive(
    supabase,
    access.project.tenant_id,
    "ai_proposals",
    { intent: "read" },
  )
  if (moduleDenial) return moduleDenial

  const statusParsed = statusSchema.safeParse(
    new URL(request.url).searchParams.get("status") ?? undefined,
  )
  if (!statusParsed.success) {
    return apiError("validation_error", "Invalid status filter.", 400, "status")
  }

  let query = supabase
    .from("ki_suggestions")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .eq("purpose", "work_items_from_project_intent")
    .order("created_at", { ascending: false })

  if (statusParsed.data) query = query.eq("status", statusParsed.data)

  const { data, error } = await query
  if (error) return apiError("read_failed", error.message, 500)

  return NextResponse.json({ suggestions: data ?? [] }, { status: 200 })
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: projectId } = await ctx.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "id must be a UUID.", 400, "id")
  }

  let body: unknown = {}
  if (request.headers.get("content-length") !== "0") {
    try {
      body = await request.json()
    } catch {
      body = {}
    }
  }
  const parsed = postBodySchema.safeParse(
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

  const context = await collectWorkItemsFromIntentContext(supabase, projectId)
  if (!context) {
    return apiError("context_failed", "Projektkontext nicht lesbar.", 500)
  }

  const result = await invokeWorkItemsFromIntentGeneration({
    supabase,
    tenantId: access.project.tenant_id,
    projectId,
    actorUserId: userId,
    context,
    count: parsed.data.count,
  })

  return NextResponse.json(result, { status: 200 })
}
