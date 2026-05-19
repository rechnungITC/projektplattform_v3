/**
 * PROJ-65 ε.1 — Client-side API helpers for project goals + compliance
 * lanes. Frontend consumes these in the Trajectory-View (ε.3 GoalNode +
 * ε.1 SidetrackLane rendering).
 */

export type ProjectGoalStatus =
  | "draft"
  | "active"
  | "achieved"
  | "abandoned"

export interface ProjectGoal {
  id: string
  tenant_id: string
  project_id: string
  title: string
  description: string | null
  success_criteria: string | null
  target_date: string | null
  status: ProjectGoalStatus
  parent_goal_id: string | null
  source_phase_id: string | null
  source_milestone_id: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ComplianceLaneSource = "tag" | "manual"

export interface ComplianceLane {
  id: string
  work_item_id: string
  lane_key: string
  display_label: string | null
  source_kind: ComplianceLaneSource
  created_at: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; field?: string }
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let msg = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as ApiErrorBody
      msg = body.error?.message ?? msg
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return (await response.json()) as T
}

const goalBase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/goals`

export async function listProjectGoals(
  projectId: string,
  options: { parentGoalId?: string | null } = {},
): Promise<ProjectGoal[]> {
  const url = new URL(goalBase(projectId), "http://placeholder")
  if (options.parentGoalId === null) {
    url.searchParams.set("parent_goal_id", "null")
  } else if (typeof options.parentGoalId === "string") {
    url.searchParams.set("parent_goal_id", options.parentGoalId)
  }
  const res = await fetch(url.pathname + url.search, { cache: "no-store" })
  const body = await unwrap<{ goals: ProjectGoal[] }>(res)
  return body.goals
}

export interface CreateGoalInput {
  title: string
  description?: string | null
  success_criteria?: string | null
  target_date?: string | null
  status?: ProjectGoalStatus
  parent_goal_id?: string | null
  source_phase_id?: string | null
  source_milestone_id?: string | null
  sort_order?: number
}

export async function createProjectGoal(
  projectId: string,
  input: CreateGoalInput,
): Promise<ProjectGoal> {
  const res = await fetch(goalBase(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const body = await unwrap<{ goal: ProjectGoal }>(res)
  return body.goal
}

export type UpdateGoalInput = Partial<CreateGoalInput>

export async function updateProjectGoal(
  projectId: string,
  goalId: string,
  input: UpdateGoalInput,
): Promise<ProjectGoal> {
  const res = await fetch(
    `${goalBase(projectId)}/${encodeURIComponent(goalId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  const body = await unwrap<{ goal: ProjectGoal }>(res)
  return body.goal
}

export async function deleteProjectGoal(
  projectId: string,
  goalId: string,
): Promise<void> {
  const res = await fetch(
    `${goalBase(projectId)}/${encodeURIComponent(goalId)}`,
    { method: "DELETE" },
  )
  if (!res.ok && res.status !== 204) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as ApiErrorBody
      msg = body.error?.message ?? msg
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
}

export async function listWorkItemComplianceLanes(
  projectId: string,
  workItemId: string,
): Promise<ComplianceLane[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}/lanes`,
    { cache: "no-store" },
  )
  const body = await unwrap<{ lanes: ComplianceLane[] }>(res)
  return body.lanes
}
