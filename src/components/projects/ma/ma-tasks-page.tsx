"use client"

import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ResponsibleUserPicker } from "@/components/projects/responsible-user-picker"
import { DeleteWorkItemDialog } from "@/components/work-items/delete-work-item-dialog"
import { WorkItemPriorityBadge } from "@/components/work-items/work-item-priority-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { usePhases } from "@/hooks/use-phases"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  WORK_ITEM_STATUS_LABELS,
  WORK_ITEM_STATUSES,
  type WorkItemStatus,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { MaTaskDialog } from "./ma-task-dialog"

const ALL = "__all__"
const NO_PHASE = "__none__"

/** Overdue = a due date in the past on a task that is still actionable. */
function isOverdue(item: WorkItemWithProfile, todayIso: string): boolean {
  if (!item.due_date) return false
  if (item.status === "done" || item.status === "cancelled") return false
  return item.due_date < todayIso
}

function workstreamOf(item: WorkItemWithProfile): string | null {
  const attrs = (item.attributes ?? {}) as Record<string, unknown>
  const ws = attrs.ma_workstream
  return typeof ws === "string" && ws.length > 0 ? ws : null
}

interface Filters {
  responsibleUserId: string | null
  phaseId: string | null
  status: WorkItemStatus | null
  dueAfter: string
  dueBefore: string
  workstream: string
}

const EMPTY_FILTERS: Filters = {
  responsibleUserId: null,
  phaseId: null,
  status: null,
  dueAfter: "",
  dueBefore: "",
  workstream: "",
}

export function MaTasksPage({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const canEdit = useProjectAccess(projectId, "edit_master")
  const { phases } = usePhases(projectId)

  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS)
  // The workstream free-text is debounced into the query to avoid a fetch per keystroke.
  const [workstreamQuery, setWorkstreamQuery] = React.useState("")
  React.useEffect(() => {
    const t = setTimeout(() => setWorkstreamQuery(filters.workstream.trim()), 300)
    return () => clearTimeout(t)
  }, [filters.workstream])

  const { items, loading, error, refresh } = useWorkItems(projectId, {
    kinds: ["task"],
    statuses: filters.status ? [filters.status] : undefined,
    responsibleUserId: filters.responsibleUserId ?? undefined,
    phaseId: filters.phaseId ?? undefined,
    dueAfter: filters.dueAfter || undefined,
    dueBefore: filters.dueBefore || undefined,
    workstream: workstreamQuery || undefined,
  })

  const [createOpen, setCreateOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<WorkItemWithProfile | null>(null)
  const [deleteItem, setDeleteItem] = React.useState<WorkItemWithProfile | null>(
    null
  )
  const [statusBusyId, setStatusBusyId] = React.useState<string | null>(null)

  const todayIso = React.useMemo(
    () => new Date().toISOString().slice(0, 10),
    []
  )

  const phaseName = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of phases) map.set(p.id, `${p.sequence_number}. ${p.name}`)
    return map
  }, [phases])

  const filtersActive =
    filters.responsibleUserId !== null ||
    filters.phaseId !== null ||
    filters.status !== null ||
    filters.dueAfter !== "" ||
    filters.dueBefore !== "" ||
    filters.workstream !== ""

  async function changeStatus(item: WorkItemWithProfile, status: WorkItemStatus) {
    if (status === item.status) return
    setStatusBusyId(item.id)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new Error(body?.error?.message ?? "Statuswechsel fehlgeschlagen.")
      }
      await refresh()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Statuswechsel fehlgeschlagen."
      )
    } finally {
      setStatusBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Aufgaben</h1>
          <p className="text-sm text-muted-foreground">
            Operative Aufgaben mit Verantwortlichem, Frist und Phase.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neue Aufgabe
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Verantwortlicher</Label>
          {currentTenant?.id ? (
            <ResponsibleUserPicker
              tenantId={currentTenant.id}
              value={filters.responsibleUserId ?? ""}
              onChange={(id) =>
                setFilters((f) => ({ ...f, responsibleUserId: id || null }))
              }
              includeAllOption
              placeholder="Alle"
            />
          ) : (
            <Input disabled placeholder="Kein Tenant" />
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Phase</Label>
          <Select
            value={filters.phaseId ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, phaseId: v === ALL ? null : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Phasen</SelectItem>
              <SelectItem value={NO_PHASE}>Ohne Phase</SelectItem>
              {phases.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.sequence_number}. {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={filters.status ?? ALL}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                status: v === ALL ? null : (v as WorkItemStatus),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Alle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Status</SelectItem>
              {WORK_ITEM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {WORK_ITEM_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Frist ab</Label>
          <Input
            type="date"
            value={filters.dueAfter}
            onChange={(e) =>
              setFilters((f) => ({ ...f, dueAfter: e.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Frist bis</Label>
          <Input
            type="date"
            value={filters.dueBefore}
            onChange={(e) =>
              setFilters((f) => ({ ...f, dueBefore: e.target.value }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Workstream</Label>
          <Input
            value={filters.workstream}
            onChange={(e) =>
              setFilters((f) => ({ ...f, workstream: e.target.value }))
            }
            placeholder="z. B. Financial DD"
          />
        </div>

        {filtersActive && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              <X className="mr-1 h-4 w-4" />
              Filter zurücksetzen
            </Button>
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Aufgaben werden geladen…
        </div>
      ) : error ? (
        <p className="py-12 text-sm text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {filtersActive
            ? "Keine Aufgaben passen zu den Filtern."
            : "Noch keine Aufgaben. Lege die erste Aufgabe an."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titel</TableHead>
                <TableHead className="hidden md:table-cell">Verantwortlich</TableHead>
                <TableHead>Frist</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Phase</TableHead>
                <TableHead className="hidden lg:table-cell">Priorität</TableHead>
                <TableHead className="w-[1%]" aria-label="Aktionen" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const overdue = isOverdue(item, todayIso)
                const ws = workstreamOf(item)
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.title}</div>
                      {ws && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {ws}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {item.responsible_display_name ??
                        item.responsible_email ??
                        "—"}
                    </TableCell>
                    <TableCell
                      className={
                        overdue
                          ? "font-medium text-destructive"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {item.due_date ? (
                        <span
                          title={overdue ? "Überfällig" : undefined}
                          aria-label={
                            overdue ? `Überfällig: ${item.due_date}` : undefined
                          }
                        >
                          {item.due_date}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.status}
                        onValueChange={(v) =>
                          changeStatus(item, v as WorkItemStatus)
                        }
                        disabled={!canEdit || statusBusyId === item.id}
                      >
                        <SelectTrigger className="h-8 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WORK_ITEM_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {WORK_ITEM_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {item.phase_id ? phaseName.get(item.phase_id) ?? "—" : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <WorkItemPriorityBadge priority={item.priority} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditItem(item)}
                            aria-label="Aufgabe bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setDeleteItem(item)}
                            aria-label="Aufgabe löschen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <MaTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onSaved={refresh}
      />
      <MaTaskDialog
        open={editItem !== null}
        onOpenChange={(o) => {
          if (!o) setEditItem(null)
        }}
        projectId={projectId}
        item={editItem}
        onSaved={refresh}
      />
      {deleteItem && (
        <DeleteWorkItemDialog
          open={deleteItem !== null}
          onOpenChange={(o) => {
            if (!o) setDeleteItem(null)
          }}
          projectId={projectId}
          item={deleteItem}
          onDeleted={async () => {
            setDeleteItem(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
