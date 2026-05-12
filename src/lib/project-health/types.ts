import type { SupportedCurrency } from "@/types/tenant-settings"

export type HealthLight = "green" | "yellow" | "red"
export type HealthState = HealthLight | "empty" | "unknown"

export interface ProjectHealthSummary {
  currency: SupportedCurrency
  budget: {
    planned: number
    actual: number
    utilization_percent: number | null
    item_count: number
    missing_rate_count: number
    state: HealthState
  }
  risks: {
    open_count: number
    critical_open_count: number
    top_score: number
    state: HealthState
  }
  schedule: {
    overdue_milestone_count: number
    state: HealthState
  }
  stakeholders: {
    active_count: number
    max_score: number
    red_count: number
    orange_count: number
    yellow_count: number
    green_count: number
    state: HealthState
  }
  communications: {
    open_count: number
    overdue_count: number
    state: HealthState
  }
  health: {
    light: HealthLight
    label: string
    basis: string[]
  }
}
