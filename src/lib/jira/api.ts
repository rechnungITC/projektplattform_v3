import type { JiraFieldMapping } from "@/lib/jira/mapping"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export interface JiraExportPreviewItem {
  work_item_id: string
  title: string
  kind: string
  action: "create" | "update" | "skip"
  jira_issue_key: string | null
  jira_issue_url: string | null
  warnings: string[]
}

export interface JiraExportPreview {
  mapping: JiraFieldMapping
  items: JiraExportPreviewItem[]
}

export interface JiraExportJobResult {
  job_id: string
  status: "succeeded" | "partial_failed" | "failed"
}

export interface JiraExportJobDetail {
  job: Record<string, unknown>
  log: Array<Record<string, unknown>>
}

export async function getJiraMapping(
  projectId: string
): Promise<JiraFieldMapping> {
  const response = await fetch(`/api/projects/${projectId}/jira/mapping`, {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { mapping: JiraFieldMapping }
  return body.mapping
}

export async function saveJiraMapping(
  projectId: string,
  mapping: JiraFieldMapping
): Promise<JiraFieldMapping> {
  const response = await fetch(`/api/projects/${projectId}/jira/mapping`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapping),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { mapping: JiraFieldMapping }
  return body.mapping
}

export async function previewJiraExport(
  projectId: string,
  workItemIds: string[]
): Promise<JiraExportPreview> {
  const response = await fetch(`/api/projects/${projectId}/jira/export/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work_item_ids: workItemIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as JiraExportPreview
}

export async function startJiraExport(
  projectId: string,
  workItemIds: string[]
): Promise<JiraExportJobResult> {
  const response = await fetch(`/api/projects/${projectId}/jira/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work_item_ids: workItemIds }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as JiraExportJobResult
}

export async function getJiraExportJob(
  projectId: string,
  jobId: string
): Promise<JiraExportJobDetail> {
  const response = await fetch(
    `/api/projects/${projectId}/jira/export/jobs/${jobId}`,
    {
      method: "GET",
      cache: "no-store",
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as JiraExportJobDetail
}
