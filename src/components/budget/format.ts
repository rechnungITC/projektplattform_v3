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
  green: "bg-success/15 text-success",
  yellow: "bg-warning/15 text-warning",
  red: "bg-destructive/15 text-destructive",
}

export const TRAFFIC_LIGHT_LABELS: Record<TrafficLightState, string> = {
  green: "OK",
  yellow: "Warnung",
  red: "Überschritten",
}
