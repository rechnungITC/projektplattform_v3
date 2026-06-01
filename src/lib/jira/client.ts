import { z } from "zod"

import type { ConnectorHealth } from "@/lib/connectors/types"

export const JiraCredentialsSchema = z.object({
  base_url: z
    .string()
    .url("Jira Base-URL muss eine gueltige URL sein")
    .transform((value) => value.replace(/\/+$/, "")),
  email: z.string().email("Jira Login-E-Mail fehlt"),
  api_token: z.string().min(10, "Jira API-Token fehlt"),
  default_project_key: z
    .string()
    .min(1, "Jira Project-Key fehlt")
    .max(32)
    .transform((value) => value.trim().toUpperCase()),
})

export type JiraCredentials = z.infer<typeof JiraCredentialsSchema>

export interface JiraRequestOptions {
  method?: "GET" | "POST" | "PUT"
  body?: unknown
  fetchImpl?: typeof fetch
}

export interface JiraIssueResult {
  key: string
  self?: string
}

interface JiraErrorPayload {
  errorMessages?: unknown
  errors?: unknown
  message?: unknown
}

export function sanitizeJiraError(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : "Jira request failed"
  return raw
    .replace(/Basic\s+[A-Za-z0-9+/=._-]+/gi, "Basic [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/api[_-]?token[=:]\s*[^,\s)]+/gi, "api_token=[redacted]")
    .replace(/password[=:]\s*[^,\s)]+/gi, "password=[redacted]")
    .slice(0, 500)
}

function authHeader(credentials: JiraCredentials): string {
  const token = Buffer.from(
    `${credentials.email}:${credentials.api_token}`,
    "utf8"
  ).toString("base64")
  return `Basic ${token}`
}

function jiraUrl(credentials: JiraCredentials, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${credentials.base_url}${normalizedPath}`
}

function messageFromPayload(payload: JiraErrorPayload): string | null {
  if (Array.isArray(payload.errorMessages) && payload.errorMessages.length > 0) {
    return payload.errorMessages.filter((m) => typeof m === "string").join("; ")
  }
  if (payload.errors && typeof payload.errors === "object") {
    const values = Object.values(payload.errors).filter(
      (m): m is string => typeof m === "string"
    )
    if (values.length > 0) return values.join("; ")
  }
  if (typeof payload.message === "string") return payload.message
  return null
}

export async function jiraRequest<T>(
  credentials: JiraCredentials,
  path: string,
  options: JiraRequestOptions = {}
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(jiraUrl(credentials, path), {
    method: options.method ?? "GET",
    headers: {
      Authorization: authHeader(credentials),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const payload = (await response.json()) as JiraErrorPayload
      detail = messageFromPayload(payload) ?? detail
    } catch {
      // Keep the HTTP status fallback.
    }
    throw new Error(sanitizeJiraError(detail))
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function testJiraConnection(
  credentials: JiraCredentials,
  fetchImpl?: typeof fetch
): Promise<ConnectorHealth> {
  try {
    await jiraRequest<unknown>(credentials, "/rest/api/3/myself", {
      fetchImpl,
    })
    return {
      status: "adapter_ready_configured",
      detail: "Jira-Verbindung erfolgreich getestet.",
    }
  } catch (err) {
    return {
      status: "error",
      detail: sanitizeJiraError(err),
    }
  }
}

export interface JiraIssuePayloadInput {
  projectKey: string
  issueType: string
  summary: string
  description?: string | null
  priority?: string | null
  labels?: string[]
}

function jiraDoc(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: text
          ? [
              {
                type: "text",
                text,
              },
            ]
          : [],
      },
    ],
  }
}

export function buildJiraIssuePayload(input: JiraIssuePayloadInput) {
  const fields: Record<string, unknown> = {
    project: { key: input.projectKey },
    issuetype: { name: input.issueType },
    summary: input.summary,
  }

  if (input.description) fields.description = jiraDoc(input.description)
  if (input.priority) fields.priority = { name: input.priority }
  if (input.labels && input.labels.length > 0) fields.labels = input.labels

  return { fields }
}

export async function createJiraIssue(
  credentials: JiraCredentials,
  payload: unknown,
  fetchImpl?: typeof fetch
): Promise<JiraIssueResult> {
  return jiraRequest<JiraIssueResult>(credentials, "/rest/api/3/issue", {
    method: "POST",
    body: payload,
    fetchImpl,
  })
}

export async function updateJiraIssue(
  credentials: JiraCredentials,
  issueKey: string,
  payload: unknown,
  fetchImpl?: typeof fetch
): Promise<void> {
  await jiraRequest<void>(
    credentials,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    {
      method: "PUT",
      body: payload,
      fetchImpl,
    }
  )
}

export function jiraIssueUrl(
  credentials: Pick<JiraCredentials, "base_url">,
  issueKey: string
): string {
  return `${credentials.base_url}/browse/${encodeURIComponent(issueKey)}`
}
