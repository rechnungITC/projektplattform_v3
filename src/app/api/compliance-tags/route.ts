import { NextResponse } from "next/server"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"

// -----------------------------------------------------------------------------
// GET /api/compliance-tags
//   Returns all compliance tags visible to the caller (RLS-scoped to their
//   tenant). Used by the work-item drawer + the master-data screen.
// -----------------------------------------------------------------------------
export async function GET() {
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { data, error } = await supabase
    .from("compliance_tags")
    .select("*")
    .order("display_name", { ascending: true })
    .limit(200)

  if (error) return apiError("list_failed", error.message, 500)
  return NextResponse.json({ tags: data ?? [] })
}
