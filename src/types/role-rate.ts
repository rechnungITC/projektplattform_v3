/**
 * PROJ-24 — Role rate (Tagessatz pro Rolle, versioniert).
 *
 * Append-only via `valid_from` — eine Tagessatz-Erhöhung ist ein neuer
 * Datensatz, kein Overwrite. UPDATE ist via RLS verboten; nur Tenant-Admins
 * dürfen INSERT/DELETE.
 *
 * `daily_rate` ist Class 3 (Personalkosten) — niemals an externe LLMs
 * leaken. Siehe `src/lib/ai/data-privacy-registry.ts`.
 */

import type { SupportedCurrency } from "./tenant-settings"

export interface RoleRate {
  id: string
  tenant_id: string
  role_key: string
  daily_rate: number
  currency: SupportedCurrency
  valid_from: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RoleRateInput {
  role_key: string
  daily_rate: number
  currency: SupportedCurrency
  valid_from: string
}
