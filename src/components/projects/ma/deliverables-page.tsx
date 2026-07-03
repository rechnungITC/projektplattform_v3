"use client"

import { Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useDeliverables } from "@/hooks/use-deliverables"
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import { useWorkstreams } from "@/hooks/use-workstreams"
import { listStakeholders } from "@/lib/stakeholders/api"
import {
  deleteDeliverable,
  transitionDeliverableStatus,
} from "@/lib/ma-project/deliverables-api"
import {
  DELIVERABLE_ALLOWED_TRANSITIONS,
  DELIVERABLE_STATUS_LABELS,
  DELIVERABLE_STATUSES,
  type Deliverable,
  type DeliverableStatus,
} from "@/types/deliverable"
import type { Stakeholder } from "@/types/stakeholder"

import { DeliverableApprovalSheet } from "./deliverable-approval-sheet"
import { DeliverableDialog } from "./deliverable-dialog"

const ALL = "__all__"

const STATUS_BADGE: Record<DeliverableStatus, string> = {
  planned: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  in_progress: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  suspended: "bg-red-500/15 text-red-700 dark:text-red-400",
}

function isOverdue(d: Deliverable, todayIso: string): boolean {
  if (!d.due_date) return false
  if (d.status === "approved" || d.status === "suspended") return false
  return d.due_date < todayIso
}

export function DeliverablesPage({ projectId }: { projectId: string }) {
  const { currentTenant, user } = useAuth()
  const canEdit = useProjectAccess(projectId, "edit_master")
  const canManage = useProjectAccess(projectId, "manage_members")
  const { deliverables, loading, error, refresh } = useDeliverables(projectId)
  const { phases } = usePhases(projectId)
  const { workstreams } = useWorkstreams(projectId)
  const { members } = useTenantMembers(currentTenant?.id)

  const [phaseFilter, setPhaseFilter] = React.useState<string>(ALL)
  const [wsFilter, setWsFilter] = React.useState<string>(ALL)
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<Deliverable | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Deliverable | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [approvalTarget, setApprovalTarget] = React.useState<Deliverable | null>(null)
  const [stakeholders, setStakeholders] = React.useState<Stakeholder[]>([])
  const autoOpenedRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    void listStakeholders(projectId)
      .then((s) => {
        if (!cancelled) setStakeholders(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Deep-link from the dashboard My-Work panel: ?freigabe=<deliverable_id>
  // opens the Freigabe sheet once the deliverables have loaded.
  React.useEffect(() => {
    if (autoOpenedRef.current || deliverables.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const target = params.get("freigabe")
    if (!target) return
    const match = deliverables.find((d) => d.id === target)
    if (match) {
      autoOpenedRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep-link open once deliverables load
      setApprovalTarget(match)
    }
  }, [deliverables])

  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), [])
  const phaseName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const p of phases) m.set(p.id, `${p.sequence_number}. ${p.name}`)
    return m
  }, [phases])
  const wsName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const w of workstreams) m.set(w.id, w.label)
    return m
  }, [workstreams])
  const memberName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const mem of members) m.set(mem.user_id, mem.display_name ?? mem.email ?? "—")
    return m
  }, [members])

  const filtered = deliverables.filter(
    (d) =>
      (phaseFilter === ALL || d.phase_id === phaseFilter) &&
      (wsFilter === ALL || d.workstream_id === wsFilter) &&
      (statusFilter === ALL || d.status === statusFilter)
  )
  const filtersActive = phaseFilter !== ALL || wsFilter !== ALL || statusFilter !== ALL

  async function changeStatus(d: Deliverable, to: DeliverableStatus) {
    if (to === d.status) return
    setBusyId(d.id)
    try {
      await transitionDeliverableStatus(
        projectId,
        d.id,
        to as Exclude<DeliverableStatus, "approved">
      )
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Statuswechsel fehlgeschlagen.")
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteDeliverable(projectId, deleteTarget.id)
      toast.success("Deliverable gelöscht.")
      setDeleteTarget(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen.")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Deliverables</h1>
          <p className="text-sm text-muted-foreground">
            Katalog der zu liefernden Artefakte je Phase und Workstream.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neues Deliverable
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Phase</Label>
          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
            <SelectTrigger><SelectValue placeholder="Alle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Phasen</SelectItem>
              {phases.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.sequence_number}. {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Workstream</Label>
          <Select value={wsFilter} onValueChange={setWsFilter}>
            <SelectTrigger><SelectValue placeholder="Alle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Workstreams</SelectItem>
              {workstreams.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Alle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Status</SelectItem>
              {DELIVERABLE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{DELIVERABLE_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtersActive && (
          <div className="sm:col-span-3">
            <Button variant="ghost" size="sm" onClick={() => { setPhaseFilter(ALL); setWsFilter(ALL); setStatusFilter(ALL) }}>
              <X className="mr-1 h-4 w-4" />Filter zurücksetzen
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Deliverables werden geladen…
        </div>
      ) : error ? (
        <p className="py-12 text-sm text-destructive">{error}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {filtersActive ? "Keine Deliverables passen zu den Filtern." : "Noch keine Deliverables."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden lg:table-cell">Phase</TableHead>
                <TableHead className="hidden md:table-cell">Workstream</TableHead>
                <TableHead className="hidden lg:table-cell">Verantwortlich</TableHead>
                <TableHead>Solltermin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[1%]" aria-label="Aktionen" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => {
                const overdue = isOverdue(d, todayIso)
                const targets = DELIVERABLE_ALLOWED_TRANSITIONS[d.status]
                const isApproved = d.status === "approved"
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {d.phase_id ? phaseName.get(d.phase_id) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {d.workstream_id ? wsName.get(d.workstream_id) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {d.responsible_user_id ? memberName.get(d.responsible_user_id) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className={overdue ? "font-medium text-destructive" : "text-sm text-muted-foreground"}>
                      {d.due_date ?? "—"}
                    </TableCell>
                    <TableCell>
                      {canEdit && !isApproved ? (
                        <Select
                          value={d.status}
                          onValueChange={(v) => changeStatus(d, v as DeliverableStatus)}
                          disabled={busyId === d.id}
                        >
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={d.status}>{DELIVERABLE_STATUS_LABELS[d.status]}</SelectItem>
                            {targets.map((t) => (
                              <SelectItem key={t} value={t}>{DELIVERABLE_STATUS_LABELS[t]}</SelectItem>
                            ))}
                            <SelectItem value="approved" disabled>
                              Freigegeben (via Freigabe)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={STATUS_BADGE[d.status]}>
                          {DELIVERABLE_STATUS_LABELS[d.status]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setApprovalTarget(d)} aria-label="Freigabe">
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(d)} aria-label="Deliverable bearbeiten">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(d)} aria-label="Deliverable löschen">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DeliverableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onSaved={refresh}
      />
      <DeliverableDialog
        open={editItem !== null}
        onOpenChange={(o) => { if (!o) setEditItem(null) }}
        projectId={projectId}
        item={editItem}
        onSaved={refresh}
      />

      <DeliverableApprovalSheet
        open={approvalTarget !== null}
        onOpenChange={(o) => { if (!o) setApprovalTarget(null) }}
        projectId={projectId}
        deliverable={approvalTarget}
        canManage={canManage}
        currentUserId={user?.id ?? null}
        stakeholders={stakeholders}
        memberName={memberName}
        onChanged={refresh}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deliverable löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{deleteTarget?.name}“ und seine Dokument-Links werden gelöscht.
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
