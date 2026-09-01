/**
 * PROJ-153-α — Client-Wrapper für Arbeitspakete aus dem Vorhaben.
 *
 * Trägt den **Status** mit (`ApiRequestError`), damit die Fläche eine Absage
 * des Substanz-Tors von einem Fehler unterscheiden kann — die Lehre aus
 * PROJ-45s `ConstructionApiError`: ohne Status ist "409 noch zugeordnet" von
 * "500 kaputt" nicht trennbar.
 */

import type { RouterWorkItemsFromIntentResult } from "@/lib/ai/types"

export interface KiSuggestionRow {
  id: string
  purpose: string
  payload: unknown
  status: string
  created_at: string
}

export class WorkItemsFromIntentError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = "WorkItemsFromIntentError"
    this.status = status
    this.code = code
  }
}

async function readError(res: Response): Promise<never> {
  let code = "unknown"
  let message = `HTTP ${res.status}`
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string } | string
    }
    if (typeof body.error === "string") {
      message = body.error
    } else if (body.error) {
      // Das Haus-Format ist { error: { code, message } }. Es als Zeichenkette
      // zu behandeln ergab in PROJ-151 wörtlich "[object Object]" für den
      // Nutzer — bei JEDEM Fehler (PROJ-Y-151b/F-2).
      code = body.error.code ?? code
      message = body.error.message ?? message
    }
  } catch {
    // Rumpf nicht lesbar — der Status bleibt die Aussage.
  }
  throw new WorkItemsFromIntentError(message, res.status, code)
}

/** Löst Substanz-Prüfung und Generierung aus. Kein `contextSourceId`. */
export async function triggerWorkItemsFromIntent(
  projectId: string,
  opts: { count?: number } = {},
): Promise<RouterWorkItemsFromIntentResult> {
  const res = await fetch(
    `/api/projects/${projectId}/ai/work-items-from-intent`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: opts.count ?? 15 }),
    },
  )
  if (!res.ok) return readError(res)
  return (await res.json()) as RouterWorkItemsFromIntentResult
}

export async function listWorkItemsFromIntentSuggestions(
  projectId: string,
  opts: { status?: "draft" | "accepted" | "rejected" } = {},
): Promise<KiSuggestionRow[]> {
  const qs = opts.status ? `?status=${opts.status}` : ""
  const res = await fetch(
    `/api/projects/${projectId}/ai/work-items-from-intent${qs}`,
    { cache: "no-store" },
  )
  if (!res.ok) return readError(res)
  const body = (await res.json()) as { suggestions?: KiSuggestionRow[] }
  return body.suggestions ?? []
}

export async function acceptWorkItemsFromIntent(
  projectId: string,
  suggestionIds: string[],
): Promise<{
  accepted_suggestion_ids: string[]
  created_work_item_ids: string[]
  accepted_at: string
}> {
  const res = await fetch(
    `/api/projects/${projectId}/ai/work-items-from-intent/accept`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suggestionIds }),
    },
  )
  if (!res.ok) return readError(res)
  return (await res.json()) as {
    accepted_suggestion_ids: string[]
    created_work_item_ids: string[]
    accepted_at: string
  }
}

export async function undoWorkItemsFromIntentAccept(
  projectId: string,
  suggestionIds: string[],
): Promise<{
  reverted_suggestion_ids: string[]
  reverted_work_item_ids: string[]
}> {
  const res = await fetch(
    `/api/projects/${projectId}/ai/work-items-from-intent/undo`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ suggestionIds }),
    },
  )
  if (!res.ok) return readError(res)
  return (await res.json()) as {
    reverted_suggestion_ids: string[]
    reverted_work_item_ids: string[]
  }
}
