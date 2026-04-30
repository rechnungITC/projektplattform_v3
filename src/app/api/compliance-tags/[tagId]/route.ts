import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// PATCH master-data fields only — admins can rename, describe, or
// (de)activate a tag. Cannot change `key`, `default_child_kinds`, or
// `template_keys` from this surface; those are platform-level for v1.
const patchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field required.",
  })

export async function PATCH(
  request: Request,
  context: { params: Promise<{ tagId: string }> }
) {
  const { tagId } = await context.params
  if (!z.string().uuid().safeParse(tagId).success) {
    return apiError("validation_error", "Invalid tag id.", 400, "tagId")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be JSON.", 400)
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    const f = parsed.error.issues[0]
    return apiError(
      "validation_error",
      f?.message ?? "Invalid body.",
      400,
      f?.path?.[0]?.toString()
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  // RLS UPDATE policy is admin-only; rely on it for authz.
  const { data, error } = await supabase
    .from("compliance_tags")
    .update(parsed.data)
    .eq("id", tagId)
    .select()
    .maybeSingle()

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Admin role required.", 403)
    if (error.code === "23514") return apiError("constraint_violation", error.message, 422)
    return apiError("update_failed", error.message, 500)
  }
  if (!data) return apiError("not_found", "Tag not found.", 404)
  return NextResponse.json({ tag: data })
}
