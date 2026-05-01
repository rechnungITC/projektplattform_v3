import { cn } from "@/lib/utils"
import { TRAFFIC_LIGHT_LABELS, type TrafficLight } from "@/lib/reports/types"

interface TrafficLightPillProps {
  light: TrafficLight
  className?: string
  /** When true, renders a larger version for use in headers. */
  size?: "default" | "lg"
}

/**
 * Status traffic-light badge. Print-friendly: uses solid colours that
 * survive the @media print stripping done in the snapshot pages.
 */
export function TrafficLightPill({
  light,
  className,
  size = "default",
}: TrafficLightPillProps) {
  const tone =
    light === "green"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-400"
      : light === "yellow"
        ? "bg-amber-100 text-amber-900 ring-amber-400"
        : "bg-rose-100 text-rose-900 ring-rose-400"
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
            ? "bg-emerald-500"
            : light === "yellow"
              ? "bg-amber-500"
              : "bg-rose-500",
        )}
      />
      {TRAFFIC_LIGHT_LABELS[light]}
    </span>
  )
}
