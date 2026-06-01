import { z } from "zod"

export const DEFAULT_ISSUE_TYPE_MAP: Record<string, string> = {
  epic: "Epic",
  feature: "Story",
  story: "Story",
  task: "Task",
  subtask: "Sub-task",
  bug: "Bug",
  work_package: "Task",
}

export const DEFAULT_STATUS_MAP: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Done",
}

export const DEFAULT_PRIORITY_MAP: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Highest",
}

const MappingRecordSchema = z.record(
  z.string().min(1).max(64),
  z.string().min(1).max(128)
)

export const JiraFieldMappingSchema = z.object({
  jira_project_key: z
    .string()
    .min(1, "Jira Project-Key fehlt")
    .max(32)
    .transform((value) => value.trim().toUpperCase()),
  issue_type_map: MappingRecordSchema.default(DEFAULT_ISSUE_TYPE_MAP),
  status_map: MappingRecordSchema.default(DEFAULT_STATUS_MAP),
  priority_map: MappingRecordSchema.default(DEFAULT_PRIORITY_MAP),
  labels: z.array(z.string().min(1).max(64)).max(20).default([]),
  assignee_mode: z.enum(["none", "responsible_user_email"]).default("none"),
})

export type JiraFieldMapping = z.infer<typeof JiraFieldMappingSchema>

export function defaultJiraFieldMapping(projectKey: string): JiraFieldMapping {
  return {
    jira_project_key: projectKey,
    issue_type_map: DEFAULT_ISSUE_TYPE_MAP,
    status_map: DEFAULT_STATUS_MAP,
    priority_map: DEFAULT_PRIORITY_MAP,
    labels: [],
    assignee_mode: "none",
  }
}

export function parseJiraFieldMapping(input: unknown): JiraFieldMapping {
  return JiraFieldMappingSchema.parse(input)
}
