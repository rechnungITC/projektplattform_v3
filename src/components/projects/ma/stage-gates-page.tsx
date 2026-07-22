"use client"

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Flag,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useStageGates } from "@/hooks/use-stage-gates"
import {
  fetchStageGatePrereadiness,
  seedStageGates,
} from "@/lib/ma-project/stage-gates-api"
import type {
  StageGate,
  StageGatePrereadiness,
  StageGateStatus,
} from "@/lib/ma-project/stage-gates-api"

import { StageGateDecideDialog } from "./stage-gate-decide-dialog"

const STATUS_META: Record<
  StageGateStatus,
  { label: string; badge: string; Icon: typeof CheckCircle2 }
> = {
  pending: {
    label: "Ausstehend",
    badge: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    Icon: CircleDashed,
  },
  passed: {
    label: "Freigegeben",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Icon: CheckCircle2,
  },
  conditional: {
    label: "Auflage",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  aborted: {
    label: "Abgebrochen",
    badge: "bg-red-500/15 text-red-700 dark:text-red-400",
    Icon: XCircle,
  },
}

const CONF_LABEL: Record<string, string> = {
  standard: "Standard",
  confidential: "Vertraulich",
  strict: "Streng vertraulich",
}

function GatePreRead({ projectId, gate }: { projectId: string; gate: StageGate }) {
  const [data, setData] = React.useState<StageGatePrereadiness | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  async function handleOpen(next: boolean) {
    setOpen(next)
    if (next && data === null && !loading) {
      setLoading(true)
      setError(null)
      try {
        setData(await fetchStageGatePrereadiness(projectId, gate.id))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Pre-Read fehlgeschlagen.")
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 px-2 text-xs">
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
          Pre-Read anzeigen
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {data && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-muted-foreground">Offene Aufgaben</span>
              <span className="text-right font-medium">{data.open_tasks}</span>
              <span className="text-muted-foreground">
                Risiken ohne Maßnahme
              </span>
              <span className="text-right font-medium">
                {data.risks_without_measure}
              </span>
              <span className="text-muted-foreground">Offene Red-Flags</span>
              <span className="text-right font-medium">
                {data.open_red_flags}
              </span>
              <span className="text-muted-foreground">Pflicht-Deliverables</span>
              <span className="text-right text-muted-foreground">
                {data.mandatory_deliverables ?? "—"}
              </span>
            </div>
            {data.has_blocking_readiness && (
              <p className="flex items-start gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Es bestehen offene Risiken ohne Maßnahme oder offene Red-Flags.
                Vor der Freigabe prüfen.
              </p>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function StageGatesPage({ projectId }: { projectId: string }) {
  const canDecide = useProjectAccess(projectId, "transition")
  const { stageGates, loading, error, refresh } = useStageGates(projectId)
  const [seeding, setSeeding] = React.useState(false)
  const [decideTarget, setDecideTarget] = React.useState<StageGate | null>(null)

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await seedStageGates(projectId)
      toast.success(
        res.seeded > 0
          ? `${res.seeded} Stage-Gates angelegt.`
          : "Stage-Gates sind bereits angelegt."
      )
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seeding fehlgeschlagen.")
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Flag className="h-6 w-6 text-primary" /> Stage-Gates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Strukturierte, nachvollziehbare Freigaben an den neun M&amp;A-Gates.
            Jede Entscheidung erzeugt einen unveränderbaren Eintrag im
            Entscheidungslog.
          </p>
        </div>
        {canDecide && stageGates.length === 0 && !loading && (
          <Button onClick={handleSeed} disabled={seeding}>
            {seeding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Stage-Gates anlegen
          </Button>
        )}
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lädt Stage-Gates…
        </p>
      )}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && stageGates.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Flag className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Für dieses Projekt sind noch keine Stage-Gates angelegt.
            </p>
            {canDecide ? (
              <Button onClick={handleSeed} disabled={seeding}>
                {seeding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Neun Stage-Gates anlegen
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nur Projektleitung oder Tenant-Admin können Gates anlegen.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {stageGates.map((gate) => {
          const meta = STATUS_META[gate.status]
          const StatusIcon = meta.Icon
          return (
            <Card key={gate.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{gate.label}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`gap-1 ${meta.badge}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      {gate.confidentiality_level !== "standard" && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" />
                          {CONF_LABEL[gate.confidentiality_level]}
                        </Badge>
                      )}
                      {gate.decided_at && (
                        <span className="text-xs text-muted-foreground">
                          entschieden am{" "}
                          {new Date(gate.decided_at).toLocaleDateString("de-DE")}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  {gate.status === "pending" && canDecide && (
                    <Button size="sm" onClick={() => setDecideTarget(gate)}>
                      Entscheiden
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {gate.status === "pending" ? (
                  <GatePreRead projectId={projectId} gate={gate} />
                ) : (
                  <>
                    {gate.conditions && (
                      <p className="text-sm">
                        <span className="font-medium">Auflagen: </span>
                        {gate.conditions}
                      </p>
                    )}
                    {gate.decision_reason && (
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium">Begründung: </span>
                        {gate.decision_reason}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <StageGateDecideDialog
        projectId={projectId}
        gate={decideTarget}
        onClose={() => setDecideTarget(null)}
        onDecided={refresh}
      />
    </div>
  )
}
