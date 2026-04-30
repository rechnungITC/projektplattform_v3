/**
 * PROJ-22 — Budget-Modul types.
 */

import type { SupportedCurrency } from "@/types/tenant-settings"

export type BudgetPostingKind = "actual" | "reservation" | "reversal"

export const BUDGET_POSTING_KINDS: readonly BudgetPostingKind[] = [
  "actual",
  "reservation",
  "reversal",
] as const

export const BUDGET_POSTING_KIND_LABELS: Record<BudgetPostingKind, string> = {
  actual: "Buchung",
  reservation: "Reservierung",
  reversal: "Storno",
}

export type BudgetPostingSource = "manual" | "vendor_invoice"

export type TrafficLightState = "green" | "yellow" | "red"

export interface BudgetCategory {
  id: string
  tenant_id: string
  project_id: string
  name: string
  description: string | null
  position: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface BudgetItem {
  id: string
  tenant_id: string
  project_id: string
  category_id: string
  name: string
  description: string | null
  planned_amount: number
  planned_currency: SupportedCurrency
  is_active: boolean
  position: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface BudgetItemTotals {
  item_id: string
  tenant_id: string
  project_id: string
  category_id: string
  planned_amount: number
  planned_currency: SupportedCurrency
  is_active: boolean
  actual_amount: number
  reservation_amount: number
  multi_currency_postings_count: number
  traffic_light_state: TrafficLightState
}

/** Combined item + aggregated totals shape returned by the list endpoint. */
export interface BudgetItemWithTotals extends BudgetItem {
  actual_amount: number
  reservation_amount: number
  multi_currency_postings_count: number
  traffic_light_state: TrafficLightState
}

export interface BudgetPosting {
  id: string
  tenant_id: string
  project_id: string
  item_id: string
  kind: BudgetPostingKind
  amount: number
  currency: SupportedCurrency
  posted_at: string
  note: string | null
  source: BudgetPostingSource
  source_ref_id: string | null
  reverses_posting_id: string | null
  created_by: string
  created_at: string
}

export interface VendorInvoice {
  id: string
  tenant_id: string
  vendor_id: string
  project_id: string | null
  invoice_number: string
  invoice_date: string
  gross_amount: number
  currency: SupportedCurrency
  file_storage_key: string | null
  note: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/** Vendor-Invoice joined with `posted_amount` (sum of postings using this invoice). */
export interface VendorInvoiceWithBookings extends VendorInvoice {
  /** Total amount already booked against this invoice (in invoice currency,
   *  effective: actuals - reversals). Used by the UI to show "X of Y booked". */
  booked_amount: number
}

export interface FxRate {
  id: string
  tenant_id: string
  from_currency: SupportedCurrency
  to_currency: SupportedCurrency
  rate: number
  valid_on: string
  source: "manual" | "tenant_override"
  created_by: string
  created_at: string
}

/**
 * Summary returned by `GET /api/projects/[id]/budget/summary?in_currency=EUR`.
 * Items where the FX rate is missing carry `converted_amount: null` and are
 * also listed separately in `missing_rates` so the UI can prompt the admin.
 */
export interface BudgetSummary {
  in_currency: SupportedCurrency
  items: Array<{
    item_id: string
    item_name: string
    category_id: string
    category_name: string
    planned_currency: SupportedCurrency
    planned_amount: number
    actual_amount: number
    converted_planned: number | null
    converted_actual: number | null
    rate_used: number | null
    rate_valid_on: string | null
    traffic_light_state: TrafficLightState
  }>
  totals: {
    converted_planned: number
    converted_actual: number
  }
  missing_rates: Array<{
    from_currency: SupportedCurrency
    to_currency: SupportedCurrency
    item_count: number
  }>
}
