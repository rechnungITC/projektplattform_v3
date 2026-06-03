import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "../../../_lib/route-helpers"

// PROJ-12 — PATCH /api/ki/suggestions/[id]
// Body: { payload: { …purpose-specific fields } }
//
// Inline-edit a draft suggestion before accepting it. We don't merge
// arbitrary keys — the client sends the full new payload; we validate
// it against the per-purpose shape and store it. `is_modified` flips to
// true, `original_payload` stays untouched so reviewers can diff.
//
// PROJ-70-β added the `proposal_from_context` purpose-shape for the
// auto-backlog drawer — the same route handles both risks + proposal
// suggestions; dispatch happens after we read `sug.purpose`.

const riskPayloadSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  status: z
    .enum(["open", "mitigated", "accepted", "closed"])
    .optional()
    .default("open"),
  mitigation: z.string().max(5000).nullable().optional(),
})

// PROJ-70-β — proposal_from_context inline-edit shape.
// Locked AC-β6: only `title`, `kind`, `description` are editable.
// Hierarchy edits (parent_temp_id) are reserved for 70-δ DnD-reparenting.
// `temp_id` is run-internal and immutable; `confidence` is provider-
// declared and not user-editable; `display` is server-enriched.
const proposalFromContextPayloadSchema = z.object({
  temp_id: z.string().min(1).max(64),
  parent_temp_id: z.string().min(1).max(64).nullable(),
  kind: z.enum([
    "phase",
    "work_package",
    "todo",
    "epic",
    "story",
    "task",
    "subtask",
    "bug",
  ]),
  title: z.string().trim().min(3).max(200),
  description: z.string().max(500).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  display: z
    .object({
      method_hint_kind: z.string().nullable(),
      source_project_name: z.string().nullable(),
      context_source_title: z.string().nullable(),
    })
    .partial()
    .optional(),
})

const PURPOSE_PAYLOAD_SCHEMAS = {
  risks: riskPayloadSchema,
  proposal_from_context: proposalFromContextPayloadSchema,
} as const

type SupportedPurpose = keyof typeof PURPOSE_PAYLOAD_SCHEMAS

const bodySchema = z.object({
  payload: z.unknown(),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) {
    return apiError("validation_error", "Invalid suggestion id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = bodySchema.safeParse(body)
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

  const { data: sug, error: lookupErr } = await supabase
    .from("ki_suggestions")
    .select("id, project_id, status, purpose")
    .eq("id", id)
    .maybeSingle()
  if (lookupErr) {
    return apiError("read_failed", lookupErr.message, 500)
  }
  if (!sug) {
    return apiError("not_found", "Suggestion not found.", 404)
  }
  if (sug.status !== "draft") {
    return apiError(
      "conflict",
      "Only draft suggestions can be edited.",
      409
    )
  }
  const purpose = sug.purpose as string
  if (!(purpose in PURPOSE_PAYLOAD_SCHEMAS)) {
    return apiError(
      "validation_error",
      `This route does not support inline-edit for purpose '${purpose}'.`,
      422
    )
  }
  const purposeSchema = PURPOSE_PAYLOAD_SCHEMAS[purpose as SupportedPurpose]
  const payloadParsed = purposeSchema.safeParse(parsed.data.payload)
  if (!payloadParsed.success) {
    const first = payloadParsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid payload shape for this purpose.",
      400,
      first?.path?.[0]?.toString()
    )
  }

  const access = await requireProjectAccess(
    supabase,
    sug.project_id as string,
    userId,
    "edit"
  )
  if (access.error) return access.error

  const { data: updated, error: updateErr } = await supabase
    .from("ki_suggestions")
    .update({
      payload: payloadParsed.data,
      is_modified: true,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select(
      "id, payload, original_payload, is_modified, status, updated_at"
    )
    .single()

  if (updateErr) {
    if (updateErr.code === "PGRST116") {
      return apiError(
        "conflict",
        "Suggestion changed state during the request.",
        409
      )
    }
    return apiError("update_failed", updateErr.message, 500)
  }

  return NextResponse.json({ suggestion: updated })
}
