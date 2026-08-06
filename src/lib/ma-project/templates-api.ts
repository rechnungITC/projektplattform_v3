/**
 * PROJ-96 — fetch wrappers around the M&A project-template catalog
 * (/api/ma-project-templates, tenant-scoped) and the project-scoped
 * apply-template surface. Consumed by the wizard template picker and the
 * admin catalog view in the /frontend slice.
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type DealSide = "buy" | "sell" | "carve_out" | "jv" | "minority"

export const DEAL_SIDE_LABELS: Record<DealSide, string> = {
  buy: "Buy-Side",
  sell: "Sell-Side",
  carve_out: "Carve-out",
  jv: "Joint Venture",
  minority: "Minderheitsbeteiligung",
}

export interface MaTemplateWorkstream {
  id: string
  template_id: string
  workstream_key: string
  label: string
  goal: string | null
  confidentiality_level: MaConfidentialityLevel
  sort_order: number
}

export interface MaTemplateDeliverable {
  id: string
  template_id: string
  workstream_key: string
  name: string
  description: string | null
  status: string
  confidentiality_level: MaConfidentialityLevel
  sort_order: number
}

/**
 * PROJ-Y-96e — a template row that copies to a `work_items` entry when the
 * template is applied. Anchor rule: `workstream_key` OR `phase_key` must be
 * set (CHECK enforces ≥1 anchor). Subtasks reference a Parent-Task within
 * the same template via `parent_task_key` (self-FK, target_kind='task' only).
 */
export type MaTemplateTaskKind = "task" | "subtask"
export type MaTemplateTaskPriority = "low" | "medium" | "high" | "critical"

export interface MaTemplateTask {
  id: string
  template_id: string
  task_key: string
  title: string
  description: string | null
  target_kind: MaTemplateTaskKind
  workstream_key: string | null
  phase_key: string | null
  parent_task_key: string | null
  priority: MaTemplateTaskPriority | null
  estimated_days: number | null
  due_date_offset_days: number | null
  sort_order: number
}

export interface MaProjectTemplate {
  id: string
  tenant_id: string
  template_key: string
  name: string
  deal_side: DealSide
  description: string | null
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
  workstreams: MaTemplateWorkstream[]
  deliverables: MaTemplateDeliverable[]
  tasks: MaTemplateTask[]
}

/**
 * PROJ-Y-96e — `warnings[]` is a best-effort list of skipped rows during
 * apply. Each entry is a colon-delimited code so the FE can parse + i18n:
 *   - `skipped_task_missing_workstream:<task_key>:<workstream_key>`
 *   - `skipped_task_missing_phase:<task_key>:<phase_key>`
 *   - `skipped_subtask_missing_workstream:<subtask_key>:<workstream_key>`
 *   - `skipped_subtask_missing_phase:<subtask_key>:<phase_key>`
 *   - `skipped_subtask_parent_missing:<subtask_key>:<parent_task_key>`
 */
export type TemplateApplyWarningPrefix =
  | "skipped_task_missing_workstream"
  | "skipped_task_missing_phase"
  | "skipped_subtask_missing_workstream"
  | "skipped_subtask_missing_phase"
  | "skipped_subtask_parent_missing"

export interface ApplyTemplateResult {
  template_id: string
  template_version: number
  phase_model: unknown
  workstreams_created: number
  deliverables_created: number
  tasks_created: number
  subtasks_created: number
  warnings: string[]
  applied_at: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(
  response: Response
): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return {
      message: body.error?.message ?? `HTTP ${response.status}`,
      code: body.error?.code,
    }
  } catch {
    return { message: `HTTP ${response.status}` }
  }
}

/** Lists the tenant's M&A project templates (lazy-seeds the Buy-Side default). */
export async function listMaProjectTemplates(): Promise<MaProjectTemplate[]> {
  const response = await fetch("/api/ma-project-templates", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error((await safeError(response)).message)
  const body = (await response.json()) as { templates: MaProjectTemplate[] }
  return body.templates ?? []
}

/** Applies a template to an (empty) M&A project — copy-on-create. */
export async function applyMaProjectTemplate(
  projectId: string,
  templateId: string
): Promise<ApplyTemplateResult> {
  const response = await fetch(`/api/projects/${projectId}/apply-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId }),
  })
  if (!response.ok) throw new Error((await safeError(response)).message)
  return (await response.json()) as ApplyTemplateResult
}
