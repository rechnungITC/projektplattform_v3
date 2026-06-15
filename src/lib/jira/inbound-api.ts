/**
 * PROJ-50 — FE client wrappers for bidirectional Jira sync (β).
 *
 *   - Webhook tokens (tenant-admin): issue / list / revoke.
 *   - Sync conflicts (project-scoped): list / resolve.
 *
 * fetch + safeError pattern, mirror of src/lib/jira/api.ts.
 */

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

// --- Webhook tokens -------------------------------------------------------

export interface JiraWebhookTokenMeta {
  id: string
  label: string | null
  created_by: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

/** The reveal-once result of issuing a token — token + URL shown only here. */
export interface IssuedJiraWebhookToken {
  id: string
  label: string | null
  created_at: string
  token: string
  webhook_url: string
}

const TOKEN_BASE = "/api/connectors/jira/webhook-token"

export async function issueJiraWebhookToken(
  label?: string,
): Promise<IssuedJiraWebhookToken> {
  const response = await fetch(TOKEN_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(label ? { label } : {}),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as IssuedJiraWebhookToken
}

export async function listJiraWebhookTokens(): Promise<JiraWebhookTokenMeta[]> {
  const response = await fetch(TOKEN_BASE, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { tokens: JiraWebhookTokenMeta[] }
  return body.tokens ?? []
}

export async function revokeJiraWebhookToken(id: string): Promise<void> {
  const response = await fetch(
    `${TOKEN_BASE}?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
  if (!response.ok) throw new Error(await safeError(response))
}

// --- Sync conflicts -------------------------------------------------------

export type JiraConflictResolution = "pending" | "v3_wins" | "jira_wins" | "manual"

export interface JiraSyncConflict {
  id: string
  tenant_id: string
  project_id: string
  work_item_id: string
  external_ref_id: string | null
  field: string
  v3_value: string | null
  jira_value: string | null
  resolution: JiraConflictResolution
  detected_at: string
  resolved_by: string | null
  resolved_at: string | null
}

export interface ResolveJiraConflictResult {
  ok: boolean
  resolution: Exclude<JiraConflictResolution, "pending">
  applied: boolean
}

export async function listJiraConflicts(
  projectId: string,
  options: { resolution?: JiraConflictResolution } = {},
): Promise<JiraSyncConflict[]> {
  const base = `/api/projects/${encodeURIComponent(projectId)}/jira/conflicts`
  const url = options.resolution ? `${base}?resolution=${options.resolution}` : base
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { conflicts: JiraSyncConflict[] }
  return body.conflicts ?? []
}

export async function resolveJiraConflict(
  projectId: string,
  conflictId: string,
  resolution: Exclude<JiraConflictResolution, "pending">,
): Promise<ResolveJiraConflictResult> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/jira/conflicts/${encodeURIComponent(conflictId)}/resolve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution }),
    },
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as ResolveJiraConflictResult
}
