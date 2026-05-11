"use client"

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Info,
  ListChecks,
  Loader2,
  Sparkles,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type {
  ProjectReadinessSnapshot,
  ReadinessSeverity,
  ReadinessStatus,
} from "@/lib/project-readiness/types"

interface ReadinessChecklistProps {
  projectId: string
}

/**
 * PROJ-56 — Project-Room Readiness Checklist.
 *
 * Sits next to the existing operational `HealthSnapshot`. The
 * Health Snapshot answers "how is the project running?"; this
 * panel answers "is the project actually set up?".
 *
 * Loads `/api/projects/[id]/readiness` and renders:
 *   - a state badge (`not_ready` / `ready_with_gaps` / `ready`)
 *   - the top-3 next actions as deep-link buttons
 *   - the full checklist behind an expander
 */
export function ReadinessChecklist({ projectId }: ReadinessChecklistProps) {
  const [snapshot, setSnapshot] =
    React.useState<ProjectReadinessSnapshot | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showAll, setShowAll] = React.useState(false)
  // PROJ-56-δ — wizard handoff. The wizard appends
  // `?from_wizard=1` on its post-create redirect; we show a
  // dismissable onboarding banner above the checklist.
  const searchParams = useSearchParams()
  const fromWizardFlag = searchParams?.get("from_wizard") === "1"
  const [showWizardBanner, setShowWizardBanner] = React.useState(false)
  React.useEffect(() => {
    if (fromWizardFlag) setShowWizardBanner(true)
  }, [fromWizardFlag])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch(`/api/projects/${encodeURIComponent(projectId)}/readiness`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          let msg = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as { error?: { message?: string } }
            msg = body.error?.message ?? msg
          } catch {
            // ignore
          }
          throw new Error(msg)
        }
        return (await res.json()) as { readiness: ProjectReadinessSnapshot }
      })
      .then((body) => {
        if (!cancelled) setSnapshot(body.readiness)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden />
          Projekt-Setup
        </CardTitle>
        {snapshot && <StateBadge state={snapshot.state} />}
      </CardHeader>
      <CardContent className="space-y-4">
        {showWizardBanner && (
          <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <Sparkles
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              aria-hidden
            />
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                Willkommen — Setup-Check
              </p>
              <p className="text-xs text-muted-foreground">
                Erste Schritte: prüfe die folgende Liste und ergänze offene
                Punkte. Sobald der Status auf „Bereit&ldquo; steht, kannst du
                Reports und Steering-Kommunikation starten.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowWizardBanner(false)}
              className="h-7 px-2 text-xs"
            >
              Verstanden
            </Button>
          </div>
        )}
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Setup wird
            geprüft …
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Setup-Check fehlgeschlagen: {error}
          </p>
        )}
        {snapshot && (
          <>
            <CountsRow counts={snapshot.counts} />
            {snapshot.next_actions.length > 0 && (
              <NextActions actions={snapshot.next_actions} />
            )}
            <ChecklistRows
              snapshot={snapshot}
              showAll={showAll}
              onToggle={() => setShowAll((v) => !v)}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StateBadge({
  state,
}: {
  state: ProjectReadinessSnapshot["state"]
}) {
  if (state === "ready") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
        Bereit
      </Badge>
    )
  }
  if (state === "ready_with_gaps") {
    return (
      <Badge className="bg-amber-500 text-white hover:bg-amber-600">
        Bereit mit Lücken
      </Badge>
    )
  }
  return (
    <Badge variant="destructive">
      Setup unvollständig
    </Badge>
  )
}

function CountsRow({
  counts,
}: {
  counts: ProjectReadinessSnapshot["counts"]
}) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <CountPill
        icon={AlertCircle}
        label="Blocker"
        value={counts.open_blockers}
        tone={counts.open_blockers > 0 ? "danger" : "neutral"}
      />
      <CountPill
        icon={TriangleAlert}
        label="Warnungen"
        value={counts.open_warnings}
        tone={counts.open_warnings > 0 ? "warning" : "neutral"}
      />
      <CountPill icon={CheckCircle2} label="Erledigt" value={counts.satisfied} />
      <CountPill
        icon={Info}
        label="Nicht aktiv"
        value={counts.not_applicable}
      />
    </div>
  )
}

function CountPill({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof AlertCircle
  label: string
  value: number
  tone?: "neutral" | "warning" | "danger"
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-card px-2 py-1.5",
        tone === "danger" && "border-destructive/40",
        tone === "warning" && "border-amber-500/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums font-medium",
          tone === "danger" && value > 0 && "text-destructive",
          tone === "warning" && value > 0 && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function NextActions({
  actions,
}: {
  actions: ProjectReadinessSnapshot["next_actions"]
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Nächste Schritte
      </p>
      <ul className="space-y-1.5">
        {actions.map((a) => (
          <li key={a.label}>
            <Button
              asChild
              variant={a.severity === "blocker" ? "default" : "outline"}
              size="sm"
              className="w-full justify-between"
            >
              <Link href={a.target_url}>
                <span className="flex items-center gap-2 truncate">
                  <SeverityIcon severity={a.severity} />
                  <span className="truncate">{a.label}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChecklistRows({
  snapshot,
  showAll,
  onToggle,
}: {
  snapshot: ProjectReadinessSnapshot
  showAll: boolean
  onToggle: () => void
}) {
  const sorted = React.useMemo(() => {
    const statusRank: Record<ReadinessStatus, number> = {
      open: 0,
      not_applicable: 1,
      satisfied: 2,
    }
    return [...snapshot.items].sort(
      (a, b) => statusRank[a.status] - statusRank[b.status],
    )
  }, [snapshot.items])

  const visible = showAll ? sorted : sorted.filter((i) => i.status === "open")
  if (visible.length === 0 && !showAll) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="w-full justify-center text-xs"
      >
        Alle Prüfungen ansehen ({snapshot.items.length})
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {visible.map((item) => (
          <li
            key={item.key}
            className="flex items-start gap-2 rounded-md border p-2 text-xs"
          >
            <StatusIcon status={item.status} severity={item.severity} />
            <div className="min-w-0 flex-1">
              <Link
                href={item.target_url}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {item.label}
              </Link>
              <p className="text-xs text-muted-foreground">{item.explanation}</p>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="w-full justify-center text-xs"
      >
        {showAll
          ? "Nur offene zeigen"
          : `Alle Prüfungen ansehen (${snapshot.items.length})`}
      </Button>
    </div>
  )
}

function SeverityIcon({ severity }: { severity: ReadinessSeverity }) {
  if (severity === "blocker") {
    return <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
  }
  if (severity === "warning") {
    return (
      <TriangleAlert
        className="h-4 w-4 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
    )
  }
  return <Info className="h-4 w-4 text-muted-foreground" aria-hidden />
}

function StatusIcon({
  status,
  severity,
}: {
  status: ReadinessStatus
  severity: ReadinessSeverity
}) {
  if (status === "satisfied") {
    return (
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
        aria-hidden
      />
    )
  }
  if (status === "not_applicable") {
    return (
      <CircleDashed
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    )
  }
  if (severity === "blocker") {
    return (
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden
      />
    )
  }
  return (
    <TriangleAlert
      className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
      aria-hidden
    />
  )
}
