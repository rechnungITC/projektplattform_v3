import type { TrafficLightState } from "@/types/budget"
import type { SupportedCurrency } from "@/types/tenant-settings"

const FORMATTERS = new Map<SupportedCurrency, Intl.NumberFormat>()

export function formatCurrency(
  amount: number,
  currency: SupportedCurrency
): string {
  let f = FORMATTERS.get(currency)
  if (!f) {
    f = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    FORMATTERS.set(currency, f)
  }
  return f.format(amount)
}

export const TRAFFIC_LIGHT_CLASSES: Record<TrafficLightState, string> = {
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  yellow: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  red: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
}

export const TRAFFIC_LIGHT_LABELS: Record<TrafficLightState, string> = {
  green: "OK",
  yellow: "Warnung",
  red: "Überschritten",
}
