/**
 * PROJ-107 — fetch wrappers for the risk-category catalog.
 *
 * Two surfaces:
 *   - project-scoped list (risk form data source, lazy-seeds for M&A)
 *   - tenant-admin CRUD (master-data catalog management)
 */

import type { RiskCategory } from "@/types/risk"

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

/** Project-scoped: active categories applicable to the project (form picker). */
export async function listProjectRiskCategories(
  projectId: string
): Promise<RiskCategory[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/risk-categories`,
    { method: "GET", cache: "no-store" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { categories: RiskCategory[] }
  return body.categories ?? []
}

/** Tenant-scoped: all categories (incl. inactive) for the admin catalog UI. */
export async function listRiskCategories(): Promise<RiskCategory[]> {
  const response = await fetch("/api/risk-categories", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { categories: RiskCategory[] }
  return body.categories ?? []
}

export interface RiskCategoryInput {
  key: string
  label: string
  applies_to_project_type?: string | null
  sort_order?: number
  is_active?: boolean
}

export async function createRiskCategory(
  input: RiskCategoryInput
): Promise<RiskCategory> {
  const response = await fetch("/api/risk-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { category: RiskCategory }
  return body.category
}

export async function updateRiskCategory(
  id: string,
  input: Partial<RiskCategoryInput>
): Promise<RiskCategory> {
  const response = await fetch(
    `/api/risk-categories/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { category: RiskCategory }
  return body.category
}

export async function deleteRiskCategory(id: string): Promise<void> {
  const response = await fetch(
    `/api/risk-categories/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  )
  if (!response.ok) throw new Error(await safeError(response))
}
