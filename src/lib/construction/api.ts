/**
 * PROJ-45-α — fetch wrappers for the construction extension: tenant-wide trade
 * catalog, per-project trade assignment, and the section tree. Consumed by the
 * /frontend slice (Stammdaten catalog + the two project-room surfaces).
 *
 * Mirrors `ma-project/workstreams-api.ts`. Errors surface the server's message
 * so the caller can show why something was refused — in particular the
 * catalog delete lock, which names the blocking projects (AC-45.3).
 */

import type {
  ConstructionRagStatus,
  ConstructionSection,
  ConstructionSectionPhase,
  ConstructionTrade,
  ProjectConstructionTrade,
} from "@/types/construction"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

/** Carries the HTTP status so callers can tell 409 (in use) from a real fault. */
export class ConstructionApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ConstructionApiError"
    this.status = status
    this.code = code
  }
}

async function fail(response: Response): Promise<never> {
  let message = `HTTP ${response.status}`
  let code: string | undefined
  try {
    const body = (await response.json()) as ApiErrorBody
    message = body.error?.message ?? message
    code = body.error?.code
  } catch {
    // keep the status-only message
  }
  throw new ConstructionApiError(message, response.status, code)
}

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

// ── Tenant-wide catalog ─────────────────────────────────────────────────────

export async function listConstructionTrades(): Promise<ConstructionTrade[]> {
  const res = await fetch("/api/construction-trades", { method: "GET", cache: "no-store" })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { trades: ConstructionTrade[] }).trades
}

export interface CreateTradePayload {
  key: string
  label: string
  sort_order?: number
}

export async function createConstructionTrade(
  payload: CreateTradePayload
): Promise<ConstructionTrade> {
  const res = await fetch("/api/construction-trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { trade: ConstructionTrade }).trade
}

/**
 * Fills the catalog with the VOB/C-flavoured default list, but only while it is
 * completely empty (Q1). Returns how many rows were written — 0 means someone
 * had already curated the catalog, which is not an error.
 */
export async function seedConstructionTrades(): Promise<number> {
  const res = await fetch("/api/construction-trades?seed=1", { method: "POST" })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { seeded: number }).seeded
}

export interface UpdateTradePayload {
  label?: string
  sort_order?: number
  is_active?: boolean
}

export async function updateConstructionTrade(
  tradeId: string,
  payload: UpdateTradePayload
): Promise<ConstructionTrade> {
  const res = await fetch(`/api/construction-trades/${encodeURIComponent(tradeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { trade: ConstructionTrade }).trade
}

/**
 * Deletes a catalog entry. Throws with status 409 while the trade is still
 * assigned to any project — the message names them (AC-45.3). Deactivating via
 * {@link updateConstructionTrade} is the supported alternative.
 */
export async function deleteConstructionTrade(tradeId: string): Promise<void> {
  const res = await fetch(`/api/construction-trades/${encodeURIComponent(tradeId)}`, {
    method: "DELETE",
  })
  if (!res.ok) await fail(res)
}

// ── Project-side trades ─────────────────────────────────────────────────────

export async function listProjectTrades(
  projectId: string
): Promise<ProjectConstructionTrade[]> {
  const res = await fetch(`${p(projectId)}/construction-trades`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { trades: ProjectConstructionTrade[] }).trades
}

export interface AssignTradePayload {
  trade_id: string
  responsible_user_id?: string | null
  vendor_id?: string | null
  rag_status?: ConstructionRagStatus
  notes?: string | null
  sort_order?: number
}

export async function assignProjectTrade(
  projectId: string,
  payload: AssignTradePayload
): Promise<ProjectConstructionTrade> {
  const res = await fetch(`${p(projectId)}/construction-trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { trade: ProjectConstructionTrade }).trade
}

export type UpdateProjectTradePayload = Omit<AssignTradePayload, "trade_id">

export async function updateProjectTrade(
  projectId: string,
  projectTradeId: string,
  payload: UpdateProjectTradePayload
): Promise<ProjectConstructionTrade> {
  const res = await fetch(
    `${p(projectId)}/construction-trades/${encodeURIComponent(projectTradeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) await fail(res)
  return ((await res.json()) as { trade: ProjectConstructionTrade }).trade
}

export async function removeProjectTrade(
  projectId: string,
  projectTradeId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/construction-trades/${encodeURIComponent(projectTradeId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) await fail(res)
}

// ── Section tree ────────────────────────────────────────────────────────────

export async function listConstructionSections(
  projectId: string
): Promise<ConstructionSection[]> {
  const res = await fetch(`${p(projectId)}/construction-sections`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { sections: ConstructionSection[] }).sections
}

export interface CreateSectionPayload {
  label: string
  description?: string | null
  parent_id?: string | null
  sort_order?: number
}

export async function createConstructionSection(
  projectId: string,
  payload: CreateSectionPayload
): Promise<ConstructionSection> {
  const res = await fetch(`${p(projectId)}/construction-sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { section: ConstructionSection }).section
}

/**
 * Rename, reorder or move a section. Moving re-paths the whole subtree in the
 * database; a move that would create a cycle is refused with status 422.
 */
export async function updateConstructionSection(
  projectId: string,
  sectionId: string,
  payload: CreateSectionPayload
): Promise<ConstructionSection> {
  const res = await fetch(
    `${p(projectId)}/construction-sections/${encodeURIComponent(sectionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) await fail(res)
  return ((await res.json()) as { section: ConstructionSection }).section
}

/** Deletes a section together with its descendants — no orphans (AC-45.15). */
export async function deleteConstructionSection(
  projectId: string,
  sectionId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/construction-sections/${encodeURIComponent(sectionId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) await fail(res)
}

export async function listSectionPhases(
  projectId: string,
  sectionId: string
): Promise<ConstructionSectionPhase[]> {
  const res = await fetch(
    `${p(projectId)}/construction-sections/${encodeURIComponent(sectionId)}/phases`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) await fail(res)
  return ((await res.json()) as { links: ConstructionSectionPhase[] }).links
}

/** Replaces the whole phase set for one section in a single call (AC-45.18). */
export async function setSectionPhases(
  projectId: string,
  sectionId: string,
  phaseIds: string[]
): Promise<{ linked: number; added: number; removed: number }> {
  const res = await fetch(
    `${p(projectId)}/construction-sections/${encodeURIComponent(sectionId)}/phases`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase_ids: phaseIds }),
    }
  )
  if (!res.ok) await fail(res)
  return (await res.json()) as { linked: number; added: number; removed: number }
}
