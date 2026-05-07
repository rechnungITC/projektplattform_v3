import { cn } from "@/lib/utils"
import { TRAFFIC_LIGHT_LABELS, type TrafficLight } from "@/lib/reports/types"

interface TrafficLightPillProps {
  light: TrafficLight
  className?: string
  /** When true, renders a larger version for use in headers. */
  size?: "default" | "lg"
}

/**
 * Status traffic-light badge. Print-friendly via the `.theme-print`
 * wrapper on snapshot pages, which pins success/warning/destructive
 * tokens to their Light-mode HSL — the badge stays AA-readable on
 * white paper regardless of the user's app theme.
 */
export function TrafficLightPill({
  light,
  className,
  size = "default",
}: TrafficLightPillProps) {
  const tone =
    light === "green"
      ? "bg-success/15 text-success ring-success/40"
      : light === "yellow"
        ? "bg-warning/15 text-warning ring-warning/40"
        : "bg-destructive/15 text-destructive ring-destructive/40"
  const padding =
    size === "lg" ? "px-4 py-1.5 text-base" : "px-2.5 py-0.5 text-xs"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1",
        tone,
        padding,
        className,
      )}
      data-traffic-light={light}
    >
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          light === "green"
            ? "bg-success"
            : light === "yellow"
              ? "bg-warning"
              : "bg-destructive",
        )}
      />
      {TRAFFIC_LIGHT_LABELS[light]}
    </span>
  )
}
