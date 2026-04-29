/**
 * PROJ-12 — fetch wrappers around /api/projects/[id]/ki/* and
 * /api/ki/suggestions/[id]/*. Frontend components call these so URL
 * shapes don't leak into UI code.
 */

import type {
  KiProviderName,
  KiRiskSuggestionPayload,
  KiSuggestion,
  KiSuggestionStatus,
} from "@/types/ki"

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

const projBase = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/ki`
const sugBase = (suggestionId: string) =>
  `/api/ki/suggestions/${encodeURIComponent(suggestionId)}`

export interface SuggestRunResponse {
  run_id: string
  classification: 1 | 2 | 3
  provider: KiProviderName
  model_id: string | null
  status: "success" | "error" | "external_blocked"
  suggestion_ids: string[]
  external_blocked: boolean
}

export async function generateRiskSuggestions(
  projectId: string,
  options: { count?: number } = {}
): Promise<SuggestRunResponse> {
  const response = await fetch(`${projBase(projectId)}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "risks", count: options.count ?? 5 }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as SuggestRunResponse
}

export async function listSuggestions(
  projectId: string,
  options: { status?: KiSuggestionStatus } = {}
): Promise<KiSuggestion[]> {
  const url = options.status
    ? `${projBase(projectId)}/suggestions?status=${options.status}`
    : `${projBase(projectId)}/suggestions`
  const response = await fetch(url, { method: "GET", cache: "no-store" })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { suggestions: KiSuggestion[] }
  return body.suggestions ?? []
}

export async function acceptSuggestion(
  suggestionId: string
): Promise<{ risk_id: string }> {
  const response = await fetch(`${sugBase(suggestionId)}/accept`, {
    method: "POST",
  })
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as { risk_id: string }
}

export async function rejectSuggestion(
  suggestionId: string,
  reason?: string
): Promise<void> {
  const response = await fetch(`${sugBase(suggestionId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reason ? { reason } : {}),
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function editSuggestionPayload(
  suggestionId: string,
  payload: KiRiskSuggestionPayload
): Promise<KiSuggestion> {
  const response = await fetch(sugBase(suggestionId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { suggestion: KiSuggestion }
  return body.suggestion
}
