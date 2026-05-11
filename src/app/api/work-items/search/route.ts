import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError, getAuthenticatedUserId } from "@/app/api/_lib/route-helpers"
import type { WorkItemSearchResultItem } from "@/types/work-item-link"

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(25).default(25),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? "25",
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid query.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const { q, limit } = parsed.data
  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`

  const { data, error } = await supabase
    .from("work_items")
    .select("id, title, kind, status, project_id")
    .eq("is_deleted", false)
    .ilike("title", pattern)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (error) return apiError("search_failed", error.message, 500)

  const rows = (data ?? []) as Array<{
    id: string
    title: string
    kind: WorkItemSearchResultItem["kind"]
    status: WorkItemSearchResultItem["status"]
    project_id: string
  }>
  const projectIds = Array.from(new Set(rows.map((row) => row.project_id)))

  const { data: projects, error: projectsErr } = projectIds.length
    ? await supabase
        .from("projects")
        .select("id, name")
        .in("id", projectIds)
    : { data: [], error: null }

  if (projectsErr) return apiError("search_failed", projectsErr.message, 500)

  const projectNames = new Map<string, string>()
  for (const row of (projects ?? []) as Array<{ id: string; name: string }>) {
    projectNames.set(row.id, row.name)
  }

  const items: WorkItemSearchResultItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    project_id: row.project_id,
    project_name: projectNames.get(row.project_id) ?? "Projekt",
    accessible: true,
  }))

  return NextResponse.json({ items })
}
