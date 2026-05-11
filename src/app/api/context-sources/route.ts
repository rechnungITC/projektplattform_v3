/**
 * PROJ-44-β — context-sources collection endpoint.
 *
 * GET /api/context-sources              — list (optional ?project_id)
 * POST /api/context-sources             — register a new source
 *
 * AI processing (γ + δ slices) is deferred; this route only
 * persists the metadata + excerpt. The `processing_status` field
 * stays at `pending` until a future worker slice picks it up.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import { resolveActiveTenantId } from "@/app/api/_lib/active-tenant"
import {
  apiError,
  getAuthenticatedUserId,
} from "@/app/api/_lib/route-helpers"
import { CONTEXT_SOURCE_KINDS } from "@/types/context-source"

const createSchema = z.object({
  kind: z.enum(
    CONTEXT_SOURCE_KINDS as unknown as readonly [string, ...string[]],
  ),
  title: z.string().trim().min(1).max(500),
  content_excerpt: z
    .string()
    .max(8000, "Auszug darf 8000 Zeichen nicht überschreiten")
    .optional(),
  content_full_url: z.string().url().max(2000).optional(),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  language: z.enum(["de", "en"]).optional(),
  // Default the privacy_class on the server when the client didn't
  // classify; the DB default is 3 (safe default — keep out of
  // external LLM path).
  privacy_class: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  project_id: z.string().uuid().optional(),
})

const LIST_SELECT =
  "id, tenant_id, project_id, kind, title, content_excerpt, content_full_url, " +
  "source_metadata, language, privacy_class, processing_status, " +
  "last_processed_at, last_failure_reason, " +
  "created_by, created_at, updated_at"

export async function GET(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return apiError("forbidden", "Active workspace could not be resolved.", 403)
  }

  const url = new URL(request.url)
  const projectIdFilter = url.searchParams.get("project_id")

  let query = supabase
    .from("context_sources")
    .select(LIST_SELECT)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100)
  if (projectIdFilter) {
    query = query.eq("project_id", projectIdFilter)
  }

  const { data, error } = await query
  if (error) return apiError("internal_error", error.message, 500)

  return NextResponse.json({ context_sources: data ?? [] })
}

export async function POST(request: Request) {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const tenantId = await resolveActiveTenantId(userId, supabase)
  if (!tenantId) {
    return apiError("forbidden", "Active workspace could not be resolved.", 403)
  }

  let body: z.infer<typeof createSchema>
  try {
    body = createSchema.parse(await request.json())
  } catch (err) {
    return apiError(
      "invalid_request",
      err instanceof Error ? err.message : "Invalid body",
      400,
    )
  }

  const { data, error } = await supabase
    .from("context_sources")
    .insert({
      tenant_id: tenantId,
      project_id: body.project_id ?? null,
      kind: body.kind,
      title: body.title,
      content_excerpt: body.content_excerpt ?? null,
      content_full_url: body.content_full_url ?? null,
      source_metadata: body.source_metadata ?? {},
      language: body.language ?? null,
      privacy_class: body.privacy_class ?? 3,
      created_by: userId,
    })
    .select(LIST_SELECT)
    .single()

  if (error) {
    return apiError("internal_error", error.message, 500)
  }

  return NextResponse.json({ context_source: data }, { status: 201 })
}
