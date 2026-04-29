"use client"

import { LayoutGrid, List, Plus, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { HistoryTab } from "@/components/audit/history-tab"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { listSuggestions } from "@/lib/ki/api"
import {
  createRisk,
  deleteRisk,
  listRisks,
  type RiskInput,
  updateRisk,
} from "@/lib/risks/api"
import {
  RISK_STATUSES,
  RISK_STATUS_LABELS,
  type Risk,
  type RiskStatus,
} from "@/types/risk"

import { RiskForm } from "./risk-form"
import { RiskMatrix } from "./risk-matrix"
import { RiskTable } from "./risk-table"

type View = "list" | "matrix"
type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; risk: Risk }

const ALL_STATUS = "__all__"

interface RiskTabClientProps {
  projectId: string
}

export function RiskTabClient({ projectId }: RiskTabClientProps) {
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null

  const [risks, setRisks] = React.useState<Risk[]>([])
  const [kiDerivedRiskIds, setKiDerivedRiskIds] = React.useState<Set<string>>(
    new Set()
  )
  const [loading, setLoading] = React.useState(true)
  const [view, setView] = React.useState<View>("list")
  const [statusFilter, setStatusFilter] = React.useState<
    RiskStatus | typeof ALL_STATUS
  >(ALL_STATUS)
  const [kiOnly, setKiOnly] = React.useState(false)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      const [riskList, acceptedSuggestions] = await Promise.all([
        listRisks(projectId, {
          status: statusFilter === ALL_STATUS ? undefined : statusFilter,
        }),
        listSuggestions(projectId, { status: "accepted" }).catch(() => []),
      ])
      setRisks(riskList)
      setKiDerivedRiskIds(
        new Set(
          acceptedSuggestions
            .filter(
              (s) =>
                s.accepted_entity_type === "risks" && s.accepted_entity_id
            )
            .map((s) => s.accepted_entity_id as string)
        )
      )
    } catch (err) {
      toast.error("Risiken konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, statusFilter])

  const visibleRisks = React.useMemo(() => {
    if (!kiOnly) return risks
    return risks.filter((r) => kiDerivedRiskIds.has(r.id))
  }, [risks, kiOnly, kiDerivedRiskIds])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const onCreate = async (input: RiskInput) => {
    setSubmitting(true)
    try {
      await createRisk(projectId, input)
      toast.success("Risiko angelegt")
      setDrawer({ mode: "closed" })
      await reload()
    } catch (err) {
      toast.error("Risiko konnte nicht angelegt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onUpdate = async (riskId: string, input: RiskInput) => {
    setSubmitting(true)
    try {
      const updated = await updateRisk(projectId, riskId, input)
      toast.success("Risiko aktualisiert")
      setDrawer({ mode: "edit", risk: updated })
      await reload()
    } catch (err) {
      toast.error("Risiko konnte nicht aktualisiert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (risk: Risk) => {
    if (
      !window.confirm(`Risiko „${risk.title}" wirklich löschen?`)
    ) {
      return
    }
    try {
      await deleteRisk(projectId, risk.id)
      toast.success("Risiko gelöscht")
      setDrawer({ mode: "closed" })
      await reload()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Risiken</h1>
            <p className="text-sm text-muted-foreground">
              Risiken erfassen, scoren und steuern. Score = Wahrscheinlichkeit ×
              Auswirkung.
            </p>
          </div>
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Risiko
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList>
              <TabsTrigger value="list">
                <List className="mr-2 h-4 w-4" aria-hidden /> Liste
              </TabsTrigger>
              <TabsTrigger value="matrix">
                <LayoutGrid className="mr-2 h-4 w-4" aria-hidden /> Matrix
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as RiskStatus | typeof ALL_STATUS)
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUS}>Alle Status</SelectItem>
              {RISK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {RISK_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={kiOnly} onCheckedChange={setKiOnly} />
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Nur KI-erzeugt
          </label>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Risiken …</p>
        ) : view === "list" ? (
          <RiskTable
            risks={visibleRisks}
            kiDerivedIds={kiDerivedRiskIds}
            onRowClick={(r) => setDrawer({ mode: "edit", risk: r })}
          />
        ) : (
          <RiskMatrix
            risks={visibleRisks}
            kiDerivedIds={kiDerivedRiskIds}
            onMarkerClick={(r) => setDrawer({ mode: "edit", risk: r })}
          />
        )}
      </div>

      <Sheet
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" })
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === "edit"
                ? `${drawer.risk.title} bearbeiten`
                : "Neues Risiko"}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === "edit"
                ? "Änderungen werden direkt gespeichert und im Audit-Log festgehalten."
                : "Ein neues Risiko erfassen."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {drawer.mode === "edit" ? (
              <Tabs defaultValue="form">
                <TabsList>
                  <TabsTrigger value="form">Stammdaten</TabsTrigger>
                  <TabsTrigger value="history">Historie</TabsTrigger>
                </TabsList>
                <TabsContent value="form" className="mt-4">
                  <RiskForm
                    tenantId={tenantId}
                    initial={drawer.risk}
                    onCancel={() => setDrawer({ mode: "closed" })}
                    onSubmit={(input) => onUpdate(drawer.risk.id, input)}
                    submitting={submitting}
                    secondaryAction={
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void onDelete(drawer.risk)}
                      >
                        Löschen
                      </Button>
                    }
                  />
                </TabsContent>
                <TabsContent value="history" className="mt-4">
                  <HistoryTab
                    entityType="risks"
                    entityId={drawer.risk.id}
                    onMutated={() => void reload()}
                  />
                </TabsContent>
              </Tabs>
            ) : drawer.mode === "create" ? (
              <RiskForm
                tenantId={tenantId}
                onCancel={() => setDrawer({ mode: "closed" })}
                onSubmit={onCreate}
                submitting={submitting}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
