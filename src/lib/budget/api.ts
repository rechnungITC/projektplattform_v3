/**
 * PROJ-22 — fetch wrappers for the Budget UI.
 *
 * All endpoints are tenant- or project-scoped and gated server-side via RLS
 * + route-level auth. Client code only does network glue.
 */

import type {
  BudgetCategory,
  BudgetItem,
  BudgetItemWithTotals,
  BudgetPosting,
  BudgetPostingKind,
  BudgetSummary,
  FxRate,
  VendorInvoice,
  VendorInvoiceWithBookings,
} from "@/types/budget"
import type { SupportedCurrency } from "@/types/tenant-settings"

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

// ─── Categories ──────────────────────────────────────────────────────

export interface BudgetCategoryInput {
  name: string
  description?: string | null
  position?: number
}

export async function listBudgetCategories(
  projectId: string
): Promise<BudgetCategory[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/categories`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { categories: BudgetCategory[] }
  return body.categories ?? []
}

export async function createBudgetCategory(
  projectId: string,
  input: BudgetCategoryInput
): Promise<BudgetCategory> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/categories`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { category: BudgetCategory }
  return body.category
}

export async function updateBudgetCategory(
  projectId: string,
  categoryId: string,
  patch: Partial<BudgetCategoryInput>
): Promise<BudgetCategory> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/categories/${encodeURIComponent(categoryId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { category: BudgetCategory }
  return body.category
}

export async function deleteBudgetCategory(
  projectId: string,
  categoryId: string
): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/categories/${encodeURIComponent(categoryId)}`,
    { method: "DELETE" }
  )
  if (!res.ok && res.status !== 204) throw new Error(await safeError(res))
}

// ─── Items ────────────────────────────────────────────────────────────

export interface BudgetItemInput {
  category_id: string
  name: string
  description?: string | null
  planned_amount: number
  planned_currency: SupportedCurrency
  position?: number
  is_active?: boolean
}

export async function listBudgetItems(
  projectId: string
): Promise<BudgetItemWithTotals[]> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/items`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { items: BudgetItemWithTotals[] }
  return body.items ?? []
}

export async function createBudgetItem(
  projectId: string,
  input: BudgetItemInput
): Promise<BudgetItem> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/items`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { item: BudgetItem }
  return body.item
}

export async function updateBudgetItem(
  projectId: string,
  itemId: string,
  patch: Partial<BudgetItemInput>
): Promise<BudgetItem> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { item: BudgetItem }
  return body.item
}

export async function softDeleteBudgetItem(
  projectId: string,
  itemId: string
): Promise<BudgetItem> {
  return updateBudgetItem(projectId, itemId, { is_active: false })
}

// ─── Postings ─────────────────────────────────────────────────────────

export interface BudgetPostingInput {
  item_id: string
  kind: Exclude<BudgetPostingKind, "reversal">
  amount: number
  currency: SupportedCurrency
  posted_at: string
  note?: string | null
  source_ref_id?: string | null
}

export async function listBudgetPostings(
  projectId: string,
  options: { itemId?: string } = {}
): Promise<BudgetPosting[]> {
  const params = new URLSearchParams()
  if (options.itemId) params.set("item_id", options.itemId)
  const qs = params.toString()
  const url = `/api/projects/${encodeURIComponent(projectId)}/budget/postings${qs ? `?${qs}` : ""}`
  const res = await fetch(url, { method: "GET", cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { postings: BudgetPosting[] }
  return body.postings ?? []
}

export async function createBudgetPosting(
  projectId: string,
  input: BudgetPostingInput
): Promise<BudgetPosting> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/postings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { posting: BudgetPosting }
  return body.posting
}

export async function reverseBudgetPosting(
  projectId: string,
  postingId: string
): Promise<BudgetPosting> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/postings/${encodeURIComponent(postingId)}/reverse`,
    { method: "POST" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { reversal: BudgetPosting }
  return body.reversal
}

// ─── Summary ──────────────────────────────────────────────────────────

export async function getBudgetSummary(
  projectId: string,
  inCurrency: SupportedCurrency
): Promise<BudgetSummary> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/budget/summary?in_currency=${encodeURIComponent(inCurrency)}`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as BudgetSummary
}

// ─── Vendor Invoices ──────────────────────────────────────────────────

export interface VendorInvoiceInput {
  invoice_number: string
  invoice_date: string
  gross_amount: number
  currency: SupportedCurrency
  project_id?: string | null
  file_storage_key?: string | null
  note?: string | null
}

export async function listVendorInvoices(
  vendorId: string
): Promise<VendorInvoiceWithBookings[]> {
  const res = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/invoices`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { invoices: VendorInvoiceWithBookings[] }
  return body.invoices ?? []
}

export async function createVendorInvoice(
  vendorId: string,
  input: VendorInvoiceInput
): Promise<VendorInvoice> {
  const res = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/invoices`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { invoice: VendorInvoice }
  return body.invoice
}

export async function deleteVendorInvoice(
  vendorId: string,
  invoiceId: string
): Promise<void> {
  const res = await fetch(
    `/api/vendors/${encodeURIComponent(vendorId)}/invoices/${encodeURIComponent(invoiceId)}`,
    { method: "DELETE" }
  )
  if (!res.ok && res.status !== 204) throw new Error(await safeError(res))
}

// ─── FX Rates (Tenant Admin) ──────────────────────────────────────────

export interface FxRateInput {
  from_currency: SupportedCurrency
  to_currency: SupportedCurrency
  rate: number
  valid_on: string
  source?: "manual" | "tenant_override"
}

export async function listFxRates(tenantId: string): Promise<FxRate[]> {
  const res = await fetch(
    `/api/tenants/${encodeURIComponent(tenantId)}/fx-rates`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { rates: FxRate[] }
  return body.rates ?? []
}

export async function createFxRate(
  tenantId: string,
  input: FxRateInput
): Promise<FxRate> {
  const res = await fetch(
    `/api/tenants/${encodeURIComponent(tenantId)}/fx-rates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  const body = (await res.json()) as { rate: FxRate }
  return body.rate
}

export async function deleteFxRate(
  tenantId: string,
  rateId: string
): Promise<void> {
  const res = await fetch(
    `/api/tenants/${encodeURIComponent(tenantId)}/fx-rates/${encodeURIComponent(rateId)}`,
    { method: "DELETE" }
  )
  if (!res.ok && res.status !== 204) throw new Error(await safeError(res))
}
