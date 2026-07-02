"use client"

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/hooks/use-auth"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { useWorkstreams } from "@/hooks/use-workstreams"
import {
  deleteWorkstream,
  fetchWorkstreamDashboard,
  updateWorkstream,
} from "@/lib/ma-project/workstreams-api"
import {
  WORKSTREAM_RAG_LABELS,
  WORKSTREAM_RAG_STATUSES,
  type Workstream,
  type WorkstreamDashboardRow,
  type WorkstreamRagStatus,
} from "@/types/workstream"

import { WorkstreamDialog } from "./workstream-dialog"

const RAG_BADGE: Record<WorkstreamRagStatus, string> = {
  green: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/15 text-red-700 dark:text-red-400",
}

export function WorkstreamsPage({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { workstreams, loading, error, refresh } = useWorkstreams(projectId)
  const { members } = useTenantMembers(currentTenant?.id)

  const [dashboard, setDashboard] = React.useState<
    Record<string, WorkstreamDashboardRow>
  >({})
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Workstream | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Workstream | null>(null)
  const [ragBusyId, setRagBusyId] = React.useState<string | null>(null)

  const leadName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of members)
      m.set(mem.user_id, mem.display_name ?? mem.email ?? "—")
    return m
  }, [members])

  const loadDashboard = React.useCallback(async () => {
    try {
      const rows = await fetchWorkstreamDashboard(projectId)
      const map: Record<string, WorkstreamDashboardRow> = {}
      for (const r of rows) map[r.workstream_id] = r
      setDashboard(map)
    } catch {
      // Dashboard is a best-effort overlay; the list still renders without it.
    }
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchWorkstreamDashboard(projectId)
        if (cancelled) return
        const map: Record<string, WorkstreamDashboardRow> = {}
        for (const r of rows) map[r.workstream_id] = r
        setDashboard(map)
      } catch {
        // best-effort overlay
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, workstreams])

  async function refreshAll() {
    await refresh()
    await loadDashboard()
  }

  async function changeRag(ws: Workstream, rag: WorkstreamRagStatus) {
    if (rag === ws.rag_status) return
    setRagBusyId(ws.id)
    try {
      await updateWorkstream(projectId, ws.id, { rag_status: rag })
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Statuswechsel fehlgeschlagen.")
    } finally {
      setRagBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteWorkstream(projectId, deleteTarget.id)
      toast.success("Workstream gelöscht.")
      setDeleteTarget(null)
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  function progressPct(row: WorkstreamDashboardRow | undefined): number {
    if (!row || row.tasks_total === 0) return 0
    return Math.round((row.tasks_done / row.tasks_total) * 100)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Workstreams</h1>
          <p className="text-sm text-muted-foreground">
            Steuerungseinheiten mit Ziel, Status und Fortschritt.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Workstream
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Workstreams werden geladen…
        </div>
      ) : error ? (
        <p className="py-12 text-sm text-destructive">{error}</p>
      ) : workstreams.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Noch keine Workstreams. Lege den ersten Workstream an.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workstreams.map((ws) => {
            const row = dashboard[ws.id]
            const pct = progressPct(row)
            return (
              <Card key={ws.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{ws.label}</CardTitle>
                    <Badge className={RAG_BADGE[ws.rag_status]}>
                      {WORKSTREAM_RAG_LABELS[ws.rag_status]}
                    </Badge>
                  </div>
                  {ws.goal && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {ws.goal}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Lead:{" "}
                    <span className="text-foreground">
                      {ws.lead_user_id ? leadName.get(ws.lead_user_id) ?? "—" : "—"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Fortschritt</span>
                      <span>
                        {row ? `${row.tasks_done}/${row.tasks_total}` : "—"} ({pct}%)
                      </span>
                    </div>
                    <Progress value={pct} />
                  </div>

                  <div className="flex gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Offene Risiken:{" "}
                      <span className="text-foreground">{row?.open_risks ?? "—"}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Deliverables: <span className="text-foreground">—</span>
                    </span>
                  </div>

                  {canEdit && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Select
                        value={ws.rag_status}
                        onValueChange={(v) =>
                          changeRag(ws, v as WorkstreamRagStatus)
                        }
                        disabled={ragBusyId === ws.id}
                      >
                        <SelectTrigger className="h-8 w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WORKSTREAM_RAG_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {WORKSTREAM_RAG_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditItem(ws)}
                          aria-label="Workstream bearbeiten"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setDeleteTarget(ws)}
                          aria-label="Workstream löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <WorkstreamDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onSaved={refreshAll}
      />
      <WorkstreamDialog
        open={editItem !== null}
        onOpenChange={(o) => {
          if (!o) setEditItem(null)
        }}
        projectId={projectId}
        item={editItem}
        onSaved={refreshAll}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Workstream löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.label}“ wird gelöscht. Zugeordnete Aufgaben und
              Risiken bleiben erhalten (ihre Zuordnung wird entfernt).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
