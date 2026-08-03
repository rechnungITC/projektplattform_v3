/**
 * PROJ-5 — server-side wizard draft storage adapter.
 *
 * Backed by `/api/wizard-drafts` (table `project_wizard_drafts` with
 * owner-only RLS). Drafts are scoped to tenant + creator.
 *
 * The previous localStorage adapter was a stand-in for the frontend phase;
 * it has been replaced wholesale. The public surface (listDrafts, getDraft,
 * saveDraft, discardDraft, finalizeDraft) is what consumers use.
 */

import type { WizardData, WizardDraft } from "@/types/wizard"

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

export async function listDrafts(tenantId: string): Promise<WizardDraft[]> {
  const response = await fetch(
    `/api/wizard-drafts?tenant_id=${encodeURIComponent(tenantId)}`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) {
    throw new Error(await safeError(response))
  }
  const body = (await response.json()) as { drafts: WizardDraft[] }
  return body.drafts ?? []
}

export async function getDraft(id: string): Promise<WizardDraft | null> {
  const response = await fetch(`/api/wizard-drafts/${encodeURIComponent(id)}`, {
    method: "GET",
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(await safeError(response))
  }
  const body = (await response.json()) as { draft: WizardDraft }
  return body.draft ?? null
}

interface SaveDraftInput {
  id?: string
  tenantId: string
  data: WizardData
  /**
   * Optimistic concurrency token. When provided on PATCH, the API returns
   * `DraftConflictError` if another client wrote a newer version since.
   * Pass the `updated_at` of the most recently fetched/saved version.
   */
  expectedUpdatedAt?: string
}

export class DraftConflictError extends Error {
  readonly current: WizardDraft
  constructor(message: string, current: WizardDraft) {
    super(message)
    this.name = "DraftConflictError"
    this.current = current
  }
}

export async function saveDraft(input: SaveDraftInput): Promise<WizardDraft> {
  if (input.id) {
    const response = await fetch(
      `/api/wizard-drafts/${encodeURIComponent(input.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: input.data,
          expected_updated_at: input.expectedUpdatedAt,
        }),
      }
    )
    if (response.status === 409) {
      const body = (await response.json()) as {
        error: { message: string }
        current: WizardDraft
      }
      throw new DraftConflictError(
        body.error?.message ?? "Draft was modified elsewhere.",
        body.current
      )
    }
    if (!response.ok) {
      throw new Error(await safeError(response))
    }
    const body = (await response.json()) as { draft: WizardDraft }
    return body.draft
  }

  const response = await fetch("/api/wizard-drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: input.tenantId, data: input.data }),
  })
  if (!response.ok) {
    throw new Error(await safeError(response))
  }
  const body = (await response.json()) as { draft: WizardDraft }
  return body.draft
}

export async function discardDraft(id: string): Promise<void> {
  const response = await fetch(`/api/wizard-drafts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (response.status === 404) return // already gone
  if (!response.ok) {
    throw new Error(await safeError(response))
  }
}

/**
 * Non-fatal warnings returned by finalize (PROJ-141-γ2): e.g. the M&A
 * project template failed to apply — the project still exists and the user
 * can retry via the templates card in the project room.
 */
export interface FinalizeWarning {
  code: "template_apply_failed" | string
  message: string
}

export interface FinalizeResult {
  project: { id: string }
  warnings: FinalizeWarning[]
}

/**
 * Atomic-ish finalize — backend creates the project, runs the auto-lead
 * bootstrap, then deletes the draft. Returns the new project id AND any
 * non-fatal warnings (best-effort steps that failed but didn't block the
 * project creation).
 */
export async function finalizeDraft(id: string): Promise<FinalizeResult> {
  const response = await fetch(
    `/api/wizard-drafts/${encodeURIComponent(id)}/finalize`,
    { method: "POST" }
  )
  if (!response.ok) {
    throw new Error(await safeError(response))
  }
  const body = (await response.json()) as {
    project: { id: string }
    warnings?: FinalizeWarning[]
  }
  return { project: body.project, warnings: body.warnings ?? [] }
}
