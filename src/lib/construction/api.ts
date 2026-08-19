/**
 * PROJ-45-α/β — fetch wrappers for the construction extension: tenant-wide trade
 * catalog, per-project trade assignment, the section tree, and the defect
 * register. Consumed by the /frontend slice (Stammdaten catalog + the project-room
 * surfaces).
 *
 * Mirrors `ma-project/workstreams-api.ts`. Errors surface the server's message
 * so the caller can show why something was refused — in particular the
 * catalog delete lock, which names the blocking projects (AC-45.3).
 */

import type {
  ConstructionDefect,
  ConstructionDefectAction,
  ConstructionDefectEvent,
  ConstructionDefectSeverity,
  ConstructionDefectStatus,
  ConstructionDefectSummary,
} from "@/types/construction-defect"
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

// ── Defects (PROJ-45-β) ─────────────────────────────────────────────────────

export interface ListDefectFilters {
  trade_id?: string
  section_id?: string
  status?: ConstructionDefectStatus
  severity?: ConstructionDefectSeverity
  /** Server-side overdue filter; the definition lives in SQL + defects.ts. */
  overdue?: boolean
}

export async function listConstructionDefects(
  projectId: string,
  filters: ListDefectFilters = {}
): Promise<ConstructionDefect[]> {
  const query = new URLSearchParams()
  if (filters.trade_id) query.set("trade_id", filters.trade_id)
  if (filters.section_id) query.set("section_id", filters.section_id)
  if (filters.status) query.set("status", filters.status)
  if (filters.severity) query.set("severity", filters.severity)
  if (filters.overdue !== undefined) query.set("overdue", String(filters.overdue))

  const suffix = query.size > 0 ? `?${query.toString()}` : ""
  const res = await fetch(`${p(projectId)}/construction-defects${suffix}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { defects: ConstructionDefect[] }).defects
}

export interface CreateDefectPayload {
  title: string
  /** Mandatory — the trade carries responsibility (lock L13). */
  trade_id: string
  severity?: ConstructionDefectSeverity
  section_id?: string | null
  description?: string | null
  due_date?: string | null
  /** Omit to inherit the trade's subcontractor as a starting value. */
  vendor_id?: string | null
}

/**
 * Reports a defect. Allowed for ANY project member including viewers (lock
 * L15) — the server, not this wrapper, is the authority.
 */
export async function createConstructionDefect(
  projectId: string,
  payload: CreateDefectPayload
): Promise<ConstructionDefect> {
  const res = await fetch(`${p(projectId)}/construction-defects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { defect: ConstructionDefect }).defect
}

/**
 * Changes a defect. Emptying an optional field needs its explicit `clear_*`
 * switch — leaving a value out means "unchanged", never "empty". Sending a value
 * together with its own switch is refused with 422 as ambiguous.
 *
 * Restricted to tenant admins and project leads; a project `editor` gets 403,
 * which is stricter than the house `edit` level on purpose.
 */
export interface UpdateDefectPayload {
  title?: string
  description?: string
  clear_description?: true
  severity?: ConstructionDefectSeverity
  trade_id?: string
  section_id?: string
  clear_section?: true
  due_date?: string
  clear_due_date?: true
  responsible_user_id?: string
  clear_responsible?: true
  vendor_id?: string
  clear_vendor?: true
}

export async function updateConstructionDefect(
  projectId: string,
  defectId: string,
  payload: UpdateDefectPayload
): Promise<ConstructionDefect> {
  const res = await fetch(
    `${p(projectId)}/construction-defects/${encodeURIComponent(defectId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) await fail(res)
  return ((await res.json()) as { defect: ConstructionDefect }).defect
}

/**
 * Moves a defect along its lifecycle. `zurueckweisen` and `verwerfen` require a
 * reason. `pruefen` is refused with status 403 for whoever reported completion
 * (four-eyes) — the thrown message says so, so the caller can distinguish it
 * from a missing role.
 */
export async function transitionConstructionDefect(
  projectId: string,
  defectId: string,
  action: ConstructionDefectAction,
  reason?: string
): Promise<ConstructionDefect> {
  const res = await fetch(
    `${p(projectId)}/construction-defects/${encodeURIComponent(defectId)}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { action, reason } : { action }),
    }
  )
  if (!res.ok) await fail(res)
  return ((await res.json()) as { defect: ConstructionDefect }).defect
}

/** The append-only history of one defect, oldest first (AC-45β.12). */
export async function listConstructionDefectEvents(
  projectId: string,
  defectId: string
): Promise<ConstructionDefectEvent[]> {
  const res = await fetch(
    `${p(projectId)}/construction-defects/${encodeURIComponent(defectId)}/events`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) await fail(res)
  return ((await res.json()) as { events: ConstructionDefectEvent[] }).events
}

/** Totals and per-trade counters, computed under the caller's own RLS. */
export async function fetchConstructionDefectSummary(
  projectId: string
): Promise<ConstructionDefectSummary | null> {
  const res = await fetch(`${p(projectId)}/construction-defects/summary`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) await fail(res)
  return ((await res.json()) as { summary: ConstructionDefectSummary | null }).summary
}
