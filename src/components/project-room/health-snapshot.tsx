"use client"

import {
  Activity,
  AlertTriangle,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * V1 stub — purely presentational. Real numbers will arrive from
 * server-computed health (PROJ-7 acceptance: budget burn, risk score,
 * milestone slip). Until then we render placeholder data so the UI
 * shape is locked in and consumers can wire it up later.
 */
interface HealthSnapshotProps {
  /** Optional override values when callers already have numbers
   * available; pass undefined to keep the placeholder. */
  budget?: KpiValue
  risks?: KpiValue
  health?: KpiValue
}

export interface KpiValue {
  label: string
  /** Use one of the design-system tokens: 'primary' | 'tertiary' | 'error' | 'secondary'. */
  tone?: "primary" | "tertiary" | "error" | "secondary"
  hint?: string
}

const DEFAULTS: Required<Pick<HealthSnapshotProps, "budget" | "risks" | "health">> = {
  budget: { label: "—", tone: "secondary", hint: "Wird berechnet, sobald Positionen erfasst sind." },
  risks: { label: "—", tone: "secondary", hint: "Wird aus dem Risikoregister abgeleitet." },
  health: { label: "Grün", tone: "primary", hint: "Basis: Risiken · Termine · Budget." },
}

export function HealthSnapshot({
  budget,
  risks,
  health,
}: HealthSnapshotProps) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-3"
      role="group"
      aria-label="Health-Snapshot"
    >
      <KpiCard
        icon={Wallet}
        title="Budget"
        value={budget ?? DEFAULTS.budget}
      />
      <KpiCard
        icon={AlertTriangle}
        title="Risiken"
        value={risks ?? DEFAULTS.risks}
      />
      <KpiCard
        icon={Activity}
        title="Health"
        value={health ?? DEFAULTS.health}
      />
    </div>
  )
}

function KpiCard({
  icon: Icon,
  title,
  value,
}: {
  icon: LucideIcon
  title: string
  value: KpiValue
}) {
  return (
    <Card className="border-outline-variant bg-surface-container-low text-on-surface">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-on-surface-variant">
          {title}
        </CardTitle>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            toneToBg(value.tone)
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <p
          className={cn(
            "text-h2 font-semibold leading-none",
            toneToText(value.tone)
          )}
        >
          {value.label}
        </p>
        {value.hint ? (
          <p className="mt-2 text-xs text-on-surface-variant">{value.hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function toneToBg(tone: KpiValue["tone"]): string {
  switch (tone) {
    case "primary":
      return "bg-primary-container text-on-primary-container"
    case "tertiary":
      return "bg-tertiary-container text-on-tertiary-container"
    case "error":
      return "bg-error-container text-on-error-container"
    case "secondary":
    default:
      return "bg-secondary-container text-on-secondary-container"
  }
}

function toneToText(tone: KpiValue["tone"]): string {
  switch (tone) {
    case "primary":
      return "text-primary"
    case "tertiary":
      return "text-tertiary"
    case "error":
      return "text-error"
    case "secondary":
    default:
      return "text-on-surface"
  }
}
