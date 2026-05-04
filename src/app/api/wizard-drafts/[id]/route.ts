import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "../../_lib/route-helpers"

import { wizardDraftPatchSchema as patchSchema } from "../_schema"

// PROJ-5 — single-draft endpoints.
// GET    /api/wizard-drafts/[id]    — fetch one draft
// PATCH  /api/wizard-drafts/[id]    — overwrite the data blob (last-write-wins)
// DELETE /api/wizard-drafts/[id]    — discard

interface Ctx {
  params: Promise<{ id: string }>
}

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) {
    return apiError("validation_error", "Invalid draft id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const { data, error } = await supabase
    .from("project_wizard_drafts")
    .select(
      "id, tenant_id, created_by, name, project_type, project_method, data, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return apiError("read_failed", error.message, 500)
  }
  if (!data) {
    // RLS hides drafts from other users → null becomes 404 to avoid existence leak.
    return apiError("not_found", "Draft not found.", 404)
  }

  return NextResponse.json({ draft: data })
}

// -----------------------------------------------------------------------------
// PATCH — overwrite the data blob (caller sends the full WizardData)
// -----------------------------------------------------------------------------

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) {
    return apiError("validation_error", "Invalid draft id.", 400, "id")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
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

  const { data, expected_updated_at } = parsed.data
  const denormName = data.name?.trim() ? data.name.trim() : null

  // Optimistic concurrency precheck — if the caller provided an expected
  // timestamp, verify the row hasn't moved since they loaded it. Return
  // 409 with the current row so the client can offer "reload draft".
  if (expected_updated_at) {
    const { data: existing, error: existingErr } = await supabase
      .from("project_wizard_drafts")
      .select(
        "id, tenant_id, created_by, name, project_type, project_method, data, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle()
    if (existingErr) {
      return apiError("read_failed", existingErr.message, 500)
    }
    if (!existing) {
      return apiError("not_found", "Draft not found.", 404)
    }
    if (existing.updated_at !== expected_updated_at) {
      return NextResponse.json(
        {
          error: {
            code: "conflict",
            message:
              "Draft was modified in another session. Reload to see the latest version.",
          },
          current: existing,
        },
        { status: 409 }
      )
    }
  }

  const { data: row, error } = await supabase
    .from("project_wizard_drafts")
    .update({
      name: denormName,
      project_type: data.project_type ?? null,
      project_method: data.project_method ?? null,
      data,
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") {
      // RLS denial OR row hidden by RLS — surface as 404 either way.
      return apiError("not_found", "Draft not found.", 404)
    }
    return apiError("update_failed", error.message, 500)
  }

  return NextResponse.json({ draft: row })
}

// -----------------------------------------------------------------------------
// DELETE
// -----------------------------------------------------------------------------

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const idParse = z.string().uuid().safeParse(id)
  if (!idParse.success) {
    return apiError("validation_error", "Invalid draft id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return apiError("unauthorized", "Not signed in.", 401)
  }

  const { error, count } = await supabase
    .from("project_wizard_drafts")
    .delete({ count: "exact" })
    .eq("id", id)

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Not allowed to delete this draft.", 403)
    }
    return apiError("delete_failed", error.message, 500)
  }
  if (!count) {
    return apiError("not_found", "Draft not found.", 404)
  }

  return new NextResponse(null, { status: 204 })
}
