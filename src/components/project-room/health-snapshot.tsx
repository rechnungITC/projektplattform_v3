"use client"

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ProjectHealthSummary } from "@/lib/project-health/types"
import { cn } from "@/lib/utils"

interface HealthSnapshotProps {
  projectId?: string
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
  budget: {
    label: "—",
    tone: "secondary",
    hint: "Wird berechnet, sobald Positionen erfasst sind.",
  },
  risks: {
    label: "—",
    tone: "secondary",
    hint: "Wird aus dem Risikoregister abgeleitet.",
  },
  health: {
    label: "—",
    tone: "secondary",
    hint: "Basis: Budget · Risiken · Termine · Stakeholder.",
  },
}

interface HealthRequestState {
  projectId: string
  summary: ProjectHealthSummary | null
  error: string | null
}

export function HealthSnapshot({
  projectId,
  budget,
  risks,
  health,
}: HealthSnapshotProps) {
  const [requestState, setRequestState] =
    React.useState<HealthRequestState | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    fetch(`/api/projects/${encodeURIComponent(projectId)}/health-summary`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readApiError(response))
        return (await response.json()) as { summary: ProjectHealthSummary }
      })
      .then((body) => {
        if (!cancelled) {
          setRequestState({ projectId, summary: body.summary, error: null })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRequestState({
            projectId,
            summary: null,
            error: err instanceof Error ? err.message : "Unbekannter Fehler",
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const currentState =
    requestState?.projectId === projectId ? requestState : null
  const loading = Boolean(projectId && !currentState)
  const error = currentState?.error ?? null
  const summary = currentState?.summary ?? null
  const values = summaryToKpis(summary)

  return (
    <div
      className="grid gap-3 sm:grid-cols-3"
      role="group"
      aria-label="Health-Snapshot"
    >
      <KpiCard
        icon={Wallet}
        title="Budget"
        value={budget ?? values.budget}
        loading={loading}
        error={error}
      />
      <KpiCard
        icon={AlertTriangle}
        title="Risiken"
        value={risks ?? values.risks}
        loading={loading}
        error={error}
      />
      <KpiCard
        icon={Activity}
        title="Health"
        value={health ?? values.health}
        loading={loading}
        error={error}
      />
    </div>
  )
}

function KpiCard({
  icon: Icon,
  title,
  value,
  loading,
  error,
}: {
  icon: LucideIcon
  title: string
  value: KpiValue
  loading?: boolean
  error?: string | null
}) {
  const DisplayIcon = error ? AlertCircle : loading ? Loader2 : Icon

  return (
    <Card className="border-outline-variant bg-surface-container-low text-on-surface">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-on-surface-variant">
          {title}
        </CardTitle>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full",
            toneToBg(error ? "error" : value.tone)
          )}
        >
          <DisplayIcon
            className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            aria-hidden
          />
        </span>
      </CardHeader>
      <CardContent className="pt-0">
        <p
          className={cn(
            "text-h2 font-semibold leading-none",
            toneToText(error ? "error" : value.tone)
          )}
        >
          {loading ? "…" : value.label}
        </p>
        {error ? (
          <p className="mt-2 text-xs text-error">{error}</p>
        ) : value.hint ? (
          <p className="mt-2 text-xs text-on-surface-variant">
            {loading ? "Lade Kennzahlen …" : value.hint}
          </p>
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

function summaryToKpis(
  summary: ProjectHealthSummary | null,
): Required<Pick<HealthSnapshotProps, "budget" | "risks" | "health">> {
  if (!summary) return DEFAULTS

  const utilization = summary.budget.utilization_percent
  const budgetLabel =
    utilization === null
      ? "—"
      : `${formatNumber(summary.budget.actual)} / ${formatNumber(
          summary.budget.planned,
        )} ${summary.currency}`

  return {
    budget: {
      label: budgetLabel,
      tone: stateToTone(summary.budget.state),
      hint:
        utilization === null
          ? "Noch keine belastbare Budget-Auslastung."
          : `${formatNumber(utilization)}% Auslastung${
              summary.budget.missing_rate_count > 0
                ? " · fehlende FX-Rate"
                : ""
            }.`,
    },
    risks: {
      label:
        summary.risks.critical_open_count > 0
          ? `${summary.risks.critical_open_count} kritisch`
          : `${summary.risks.open_count} offen`,
      tone: stateToTone(summary.risks.state),
      hint: `Top-Score ${formatNumber(summary.risks.top_score)} · kritisch ab Score 16.`,
    },
    health: {
      label: summary.health.label,
      tone: stateToTone(summary.health.light),
      hint: `Stakeholder max. ${formatNumber(
        summary.stakeholders.max_score,
      )} · ${summary.schedule.overdue_milestone_count} ueberfaellige Meilensteine.`,
    },
  }
}

function stateToTone(state: ProjectHealthSummary["budget"]["state"]): KpiValue["tone"] {
  switch (state) {
    case "green":
      return "primary"
    case "yellow":
      return "tertiary"
    case "red":
      return "error"
    case "empty":
    case "unknown":
    default:
      return "secondary"
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 1,
  }).format(value)
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string }
    }
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}
