/**
 * PROJ-17 — tenant settings + branding types.
 *
 * One `tenant_settings` row per tenant, bootstrapped automatically on
 * tenant insert. JSONB fields are typed strictly here so the rest of the
 * codebase can rely on the shape without re-validating.
 */

export type TenantLanguage = "de" | "en"

export const TENANT_LANGUAGES: readonly TenantLanguage[] = ["de", "en"] as const

export interface TenantBranding {
  logo_url?: string | null
  accent_color?: string | null
}

export type ModuleKey =
  | "risks"
  | "decisions"
  | "ai_proposals"
  | "audit_reports"
  | "connectors"
  | "vendor"
  | "communication"
  | "resources"
  | "budget"
  | "output_rendering"

/** Modules that are actually built in V3 today and toggleable. */
export const TOGGLEABLE_MODULES: readonly ModuleKey[] = [
  "risks",
  "decisions",
  "ai_proposals",
  "audit_reports",
  "communication",
  "resources",
  "vendor",
  "budget",
  "output_rendering",
] as const

/** Modules that exist in the schema as future-reserved keys but are not
 *  yet built (the UI shows them disabled / "Demnächst"). */
export const RESERVED_MODULES: readonly ModuleKey[] = [
  "connectors",
] as const

export const MODULE_LABELS: Record<ModuleKey, string> = {
  risks: "Risiken",
  decisions: "Entscheidungen",
  ai_proposals: "KI-Vorschläge",
  audit_reports: "Audit-Reports",
  communication: "Kommunikation",
  resources: "Ressourcen",
  connectors: "Konnektoren",
  vendor: "Lieferanten",
  budget: "Budget",
  output_rendering: "Reports",
}

export type DataClass = 1 | 2 | 3

export interface PrivacyDefaults {
  default_class: DataClass
}

export type ExternalProviderName = "anthropic" | "none"

export interface AiProviderConfig {
  external_provider: ExternalProviderName
  model_id?: string
}

export interface RetentionOverrides {
  /** Days to keep audit_log_entries. Falls back to the system default
   *  (730) when undefined. */
  audit_log_days?: number
}

export type SupportedCurrency = "EUR" | "USD" | "CHF" | "GBP" | "JPY"

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = [
  "EUR",
  "USD",
  "CHF",
  "GBP",
  "JPY",
] as const

export interface BudgetSettings {
  default_currency: SupportedCurrency
}

export interface OutputRenderingSettings {
  /** PROJ-21 § ST-06 — feature-flag for the KI-Kurzfazit option in
   *  Status-Report and Executive-Summary. Default false. */
  ki_narrative_enabled: boolean
}

/**
 * PROJ-24 ST-02 — Cost-stack defaults at the tenant level.
 *
 * `velocity_factor` is the conversion factor from Story Points to
 * person-days for SP-based work-items (Stories). Range [0.1, 5.0],
 * default 0.5 (i.e. one Fibonacci point ≈ a half person-day).
 * `default_currency` is used as the default for newly-created role rates
 * and manual cost-lines.
 */
export interface CostSettings {
  velocity_factor: number
  default_currency: SupportedCurrency
}

export const COST_SETTINGS_DEFAULTS: CostSettings = {
  velocity_factor: 0.5,
  default_currency: "EUR",
}

export const VELOCITY_FACTOR_MIN = 0.1
export const VELOCITY_FACTOR_MAX = 5.0

export interface TenantSettings {
  tenant_id: string
  active_modules: ModuleKey[]
  privacy_defaults: PrivacyDefaults
  ai_provider_config: AiProviderConfig
  retention_overrides: RetentionOverrides
  budget_settings: BudgetSettings
  output_rendering_settings: OutputRenderingSettings
  cost_settings: CostSettings
  created_at: string
  updated_at: string
}

/**
 * Server-resolved tenant + settings snapshot used by `loadServerAuth`
 * to render the nav and gate API routes without round-trips.
 */
export interface ResolvedTenantConfig {
  tenant_id: string
  language: TenantLanguage
  branding: TenantBranding
  settings: TenantSettings
}
