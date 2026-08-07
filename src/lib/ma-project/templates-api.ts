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
  /** PROJ-Y-96b: stable soft-reference key (backfilled from name). */
  deliverable_key: string
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

/** PROJ-Y-96b (AC-Y96b.6) — one RACI row in the template catalog. */
export type MaTemplateRaciTargetType = "workstream" | "deliverable"
export type RaciLetter = "R" | "A" | "C" | "I"
export interface MaTemplateRaci {
  id: string
  template_id: string
  target_type: MaTemplateRaciTargetType
  /** soft-reference to workstream_key or deliverable_key inside the same template */
  target_key: string
  role_key: string
  raci_letter: RaciLetter
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
  /** PROJ-Y-96e: task templates copied on apply. */
  tasks: MaTemplateTask[]
  /** PROJ-Y-96b (AC-Y96b.6): RACI matrix rows for the read-only admin catalog. */
  raci: MaTemplateRaci[]
}

/**
 * PROJ-Y-96b/e unified warning shape emitted by `apply_ma_project_template`
 * when a template's task-copy or RACI-copy step encounters a non-blocking
 * issue. Warnings never fail the apply — they surface via UI toast so the
 * caller can act on them.
 *
 * PROJ-Y-96b (RACI):
 *   - `raci_unknown_role_key` — role_key not in tenant's role_rates /
 *     stakeholders. Row is stamped anyway (free-text per PROJ-24).
 *   - `raci_orphan_target`    — target_key not in template's siblings. Row
 *     is NOT stamped.
 *
 * PROJ-Y-96e (task copy):
 *   - `skipped_task_missing_workstream`    — task_key's workstream_key not
 *     resolved to a live workstream.
 *   - `skipped_task_missing_phase`         — task_key's phase_key not
 *     resolved to a live phase.
 *   - `skipped_subtask_missing_workstream` — same as above for subtask.
 *   - `skipped_subtask_missing_phase`      — same as above for subtask.
 *   - `skipped_subtask_parent_missing`     — subtask's parent_task_key
 *     couldn't be mapped (parent row was likely skipped in pass 1).
 */
export type ApplyTemplateWarningCode =
  // Y-96b (RACI)
  | "raci_unknown_role_key"
  | "raci_orphan_target"
  // Y-96e (task copy)
  | "skipped_task_missing_workstream"
  | "skipped_task_missing_phase"
  | "skipped_subtask_missing_workstream"
  | "skipped_subtask_missing_phase"
  | "skipped_subtask_parent_missing"

export interface ApplyTemplateWarning {
  code: ApplyTemplateWarningCode
  // Y-96b RACI fields
  target_type?: "workstream" | "deliverable"
  target_key?: string
  role_key?: string
  // Y-96e task-copy fields
  task_key?: string
  workstream_key?: string
  phase_key?: string
  parent_task_key?: string
}

export interface ApplyTemplateResult {
  template_id: string
  template_version: number
  phase_model: unknown
  workstreams_created: number
  deliverables_created: number
  /** PROJ-Y-96b: number of raci_assignments rows stamped by this apply. */
  raci_created: number
  /** PROJ-Y-96e: number of `kind='task'` work_items stamped by this apply. */
  tasks_created: number
  /** PROJ-Y-96e: number of `kind='subtask'` work_items stamped by this apply. */
  subtasks_created: number
  /** PROJ-Y-96e: server-side apply timestamp (also stamps `ma_project_profiles`). */
  applied_at: string
  /** PROJ-Y-96b+96e: unified non-blocking warnings (omitted or empty on success). */
  warnings?: ApplyTemplateWarning[]
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
