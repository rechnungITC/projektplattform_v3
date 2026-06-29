"use client"

import { CheckCircle2, Circle, Loader2, Lock, Workflow } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { PhaseStatusBadge } from "@/components/phases/phase-status-badge"
import { PhasesTimeline } from "@/components/phases/phases-timeline"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePhases } from "@/hooks/use-phases"
import { useMaProfile } from "@/hooks/use-ma-profile"
import { useProjectAccess } from "@/hooks/use-project-access"
import { activateMaPhaseModel } from "@/lib/ma-project/api"
import {
  MA_PHASE_PRESET,
  type MaPhasePreset,
} from "@/lib/project-types/ma-phase-preset"
import type { Phase } from "@/types/phase"

// PROJ-95 — M&A phase-model cockpit. Overlays the 10-phase preset (the full
// roadmap) against the actually-seeded `phases` rows, runs the idempotent
// activate RPC, and surfaces the mandate gate: Phase 2 ("Target-Screening") is
// locked until the mandate is approved (PROJ-94). The seeded phases also render
// in the existing PhasesTimeline (reuse, AC-95-3). AC-95-2 "ausgesetzt" rides
// on PROJ-139's suspended status (shown by PhaseStatusBadge).
type PresetState = "active" | "pending" | "locked"

interface PresetRow {
  preset: MaPhasePreset
  phase: Phase | null
  state: PresetState
}

 /** de-DE short date, em dash for null. */
function fmtDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE")
}

export function MaPhaseCockpit({ projectId }: { projectId: string }) {
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { profile, isLoading: profileLoading } = useMaProfile(projectId)
  const { phases, loading: phasesLoading, refresh } = usePhases(projectId)
  const [activating, setActivating] = React.useState(false)

  const mandateApproved = profile?.mandate_status === "approved"

  // Match seeded phases to preset entries by name (the seed RPC uses name_de).
  const rows: PresetRow[] = React.useMemo(() => {
    const byName = new Map(phases.map((p) => [p.name, p]))
    return MA_PHASE_PRESET.map((preset) => {
      const phase = byName.get(preset.name_de) ?? null
      let state: PresetState = phase ? "active" : "pending"
      if (!phase && preset.mandateGated && !mandateApproved) state = "locked"
      return { preset, phase, state }
    })
  }, [phases, mandateApproved])

  const seededCount = rows.filter((r) => r.phase).length
  const seededPhases = React.useMemo(
    () =>
      [...phases]
        .filter((p) => MA_PHASE_PRESET.some((pr) => pr.name_de === p.name))
        .sort((a, b) => a.sequence_number - b.sequence_number),
    [phases]
  )

  const handleActivate = async () => {
    setActivating(true)
    try {
      const result = await activateMaPhaseModel(projectId)
      if (result.seeded > 0) {
        toast.success(`${result.seeded} Phase(n) aktiviert`)
      } else {
        toast.info("Alle verfügbaren Phasen sind bereits aktiviert")
      }
      if (result.phase2_locked) {
        toast.info(
          "Phase 2 „Target-Screening“ bleibt gesperrt, bis das Mandat genehmigt ist."
        )
      }
      refresh()
    } catch (err) {
      toast.error("Phasenmodell konnte nicht aktiviert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setActivating(false)
    }
  }

  const loading = profileLoading || phasesLoading

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Workflow className="h-5 w-5" aria-hidden /> M&amp;A-Phasenmodell
          </h1>
          <p className="text-sm text-muted-foreground">
            Die zehn M&amp;A-Standardphasen von Strategie bis Post-Merger-Integration.
            {!mandateApproved && (
              <>
                {" "}
                Phase 2 wird erst nach Mandatsfreigabe aktivierbar.
              </>
            )}
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleActivate} disabled={activating || loading}>
            {activating && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            {seededCount === 0 ? "Phasenmodell aktivieren" : "Phasen ergänzen"}
          </Button>
        )}
      </div>

      {/* Roadmap (reuse) — visual timeline of the seeded phases. */}
      {seededPhases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roadmap</CardTitle>
            <CardDescription>
              Aktivierte Phasen in Reihenfolge. Status inklusive „Ausgesetzt“
              (pausiert) folgt der Phasen-Statusmaschine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PhasesTimeline phases={seededPhases} />
          </CardContent>
        </Card>
      )}

      {/* Preset overlay — all 10 phases with activation/gate state. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standardphasen</CardTitle>
          <CardDescription>
            {seededCount} von {MA_PHASE_PRESET.length} Phasen aktiviert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ol className="space-y-2">
              {rows.map(({ preset, phase, state }) => (
                <li
                  key={preset.key}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                    {preset.sequence}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{preset.name_de}</span>
                      {state === "active" && phase ? (
                        <PhaseStatusBadge status={phase.status} />
                      ) : state === "locked" ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        >
                          <Lock className="mr-1 h-3 w-3" aria-hidden />
                          Gesperrt — Mandat ausstehend
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Nicht aktiviert</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {preset.description_de}
                    </p>
                    {state === "active" &&
                      phase &&
                      (phase.planned_start || phase.planned_end) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">
                            Soll-Zeitraum:
                          </span>{" "}
                          {fmtDate(phase.planned_start)} – {fmtDate(phase.planned_end)}
                        </p>
                      )}
                  </div>
                  <span className="mt-0.5 shrink-0 text-muted-foreground">
                    {state === "active" ? (
                      <CheckCircle2
                        className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                        aria-label="aktiviert"
                      />
                    ) : state === "locked" ? (
                      <Lock className="h-5 w-5 text-amber-600" aria-label="gesperrt" />
                    ) : (
                      <Circle className="h-5 w-5" aria-label="nicht aktiviert" />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
