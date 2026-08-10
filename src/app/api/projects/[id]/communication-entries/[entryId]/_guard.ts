import type { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { createClient } from "@/lib/supabase/server"

// PROJ-119 — shared entry-scoped route guard. Extracted so the six new
// confidential-distribution routes do not each re-implement it.

export type EntryCtx = { params: Promise<{ id: string; entryId: string }> }

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

// NOTE: neither branch may declare the other's keys (not even as `?: never`).
// `"error" in g` only narrows when the success branch does not mention `error`
// at all — otherwise the union survives and every handler infers
// `NextResponse | undefined`.
type GuardResult =
  | { error: NextResponse }
  | {
      supabase: SupabaseClient
      entryId: string
      projectId: string
      userId: string
    }

export async function guardEntryRoute(context: EntryCtx): Promise<GuardResult> {
  const { id: projectId, entryId } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(entryId).success
  ) {
    return { error: apiError("validation_error", "Invalid id.", 400) }
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) {
    return { error: apiError("unauthorized", "Not signed in.", 401) }
  }
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return { error: access.error }
  return { supabase, entryId, projectId, userId }
}

export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<{ data: T } | { error: NextResponse }> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { error: apiError("validation_error", "Invalid JSON body.", 400) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      error: apiError(
        "validation_error",
        first?.message ?? "Invalid request body.",
        400,
        first?.path?.[0]?.toString()
      ),
    }
  }
  return { data: parsed.data }
}
