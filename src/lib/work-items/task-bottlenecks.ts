/**
 * PROJ-103 — Phasenübergreifende Aufgaben- und Engpass-Übersicht (read-only).
 *
 * A cross-workstream view of every OPEN task (work_item, status
 * todo/in_progress/blocked) in a project, enriched with workstream/phase labels,
 * days-overdue and date buckets, plus the Top-3 oldest overdue bottlenecks.
 * Served by the SECURITY INVOKER RPC `project_task_bottlenecks`; need-to-know is
 * inherited from the work_items RESTRICTIVE gate (PROJ-100a). No write model.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

/** One open task with derived engpass flags. */
export interface TaskBottleneckRow {
  id: string
  title: string
  kind: WorkItemKind
  status: WorkItemStatus
  due_date: string | null
  /** Whole days past the due date (0 when not overdue / no due date). */
  days_overdue: number
  responsible_user_id: string | null
  phase_id: string | null
  phase_name: string | null
  workstream_id: string | null
  workstream_label: string | null
  confidentiality_level: MaConfidentialityLevel
  /** Disjoint date buckets — a blocked task can additionally be overdue. */
  is_overdue: boolean
  is_due_today: boolean
  is_due_this_week: boolean
  /** Orthogonal to the date buckets. */
  is_blocked: boolean
}

/** A Top-3 bottleneck row (oldest overdue). */
export interface TaskBottleneckTop {
  id: string
  title: string
  workstream_label: string | null
  phase_name: string | null
  responsible_user_id: string | null
  due_date: string | null
  days_overdue: number
}

export interface TaskBottleneckSummary {
  open_total: number
  overdue_total: number
  due_today_total: number
  due_this_week_total: number
  blocked_total: number
}

export interface TaskBottleneckOverview {
  tasks: TaskBottleneckRow[]
  top_bottlenecks: TaskBottleneckTop[]
  summary: TaskBottleneckSummary
}

export const EMPTY_TASK_BOTTLENECK_SUMMARY: TaskBottleneckSummary = {
  open_total: 0,
  overdue_total: 0,
  due_today_total: 0,
  due_this_week_total: 0,
  blocked_total: 0,
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

/** Normalise a raw RPC task row (SQL emits NULL for some booleans). */
function normaliseRow(t: TaskBottleneckRow): TaskBottleneckRow {
  return {
    ...t,
    is_overdue: Boolean(t.is_overdue),
    is_due_today: Boolean(t.is_due_today),
    is_due_this_week: Boolean(t.is_due_this_week),
    is_blocked: Boolean(t.is_blocked),
    days_overdue: t.days_overdue ?? 0,
  }
}

/**
 * Live cross-workstream bottleneck overview for a project. Need-to-know-scoped
 * server-side by the INVOKER RPC.
 */
export async function fetchTaskBottlenecks(
  projectId: string
): Promise<TaskBottleneckOverview> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/task-bottlenecks`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const json = (await res.json()) as Partial<TaskBottleneckOverview>
  return {
    tasks: (json.tasks ?? []).map(normaliseRow),
    top_bottlenecks: json.top_bottlenecks ?? [],
    summary: json.summary ?? EMPTY_TASK_BOTTLENECK_SUMMARY,
  }
}

/** CSV export URL (RLS-scoped to the caller, formula-injection-safe). */
export function taskBottlenecksExportUrl(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/task-bottlenecks/export`
}
