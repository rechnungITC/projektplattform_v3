import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"

// PROJ-103 — CSV export of the cross-workstream bottleneck overview (AC4).
//
// GET /api/projects/[id]/task-bottlenecks/export
//
// Single source of truth: calls the SAME SECURITY INVOKER RPC as the page
// (project_task_bottlenecks), so the export is RLS-scoped to the caller — a
// task the caller may not see is not exported. Responsible-user ids are
// resolved to names via profiles (readable under the caller's RLS through the
// project-membership join). Opens in Excel; true .xlsx is out of scope.

const COLUMNS = [
  "titel",
  "workstream",
  "phase",
  "verantwortlich",
  "frist",
  "status",
  "tage_ueber_frist",
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value)
  // Escape for CSV + neutralise spreadsheet formula-injection (=,+,-,@).
  const needsQuote = /[",\n\r]/.test(s) || /^[=+\-@]/.test(s)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

interface BottleneckTask {
  title: string
  status: string
  due_date: string | null
  days_overdue: number
  responsible_user_id: string | null
  phase_name: string | null
  workstream_label: string | null
}

interface BottleneckResult {
  tasks?: BottleneckTask[]
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error

  const { data, error } = await supabase.rpc("project_task_bottlenecks", {
    p_project_id: projectId,
  })
  if (error) return apiError("export_failed", error.message, 500)

  const tasks = ((data as BottleneckResult | null)?.tasks ?? []) as BottleneckTask[]

  // Resolve responsible-user display names (profiles readable under caller RLS).
  const ids = Array.from(
    new Set(tasks.map((t) => t.responsible_user_id).filter(Boolean))
  ) as string[]
  const nameById = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", ids)
    for (const p of (profiles ?? []) as {
      id: string
      display_name: string | null
      email: string | null
    }[]) {
      nameById.set(p.id, p.display_name ?? p.email ?? p.id)
    }
  }

  const header = COLUMNS.join(",")
  const body = tasks
    .map((t) => {
      const record: Record<(typeof COLUMNS)[number], unknown> = {
        titel: t.title,
        workstream: t.workstream_label,
        phase: t.phase_name,
        verantwortlich: t.responsible_user_id
          ? (nameById.get(t.responsible_user_id) ?? t.responsible_user_id)
          : "",
        frist: t.due_date,
        status: t.status,
        tage_ueber_frist: t.days_overdue,
      }
      return COLUMNS.map((c) => csvCell(record[c])).join(",")
    })
    .join("\n")
  const csv = `${header}\n${body}`

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `engpaesse-${projectId.slice(0, 8)}-${stamp}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // RLS-limited scope is explicit so an incomplete export is not mistaken
      // for the full task set.
      "X-Export-Scope": "task-bottlenecks-visible-to-caller",
    },
  })
}
