"use client"

/**
 * PROJ-9 follow-up — Dependencies tab.
 *
 * Replaces the previous ComingSoon placeholder. Lists the polymorphic
 * dependencies that touch the current project (any combination of
 * project / phase / work_package / todo on either edge end) with
 * human-readable labels, a constraint-type filter, and a per-row
 * delete action.
 *
 * Full graph / Gantt visualization stays in PROJ-25's scope. This page
 * is a maintenance-grade list view — useful for audit / cleanup but not
 * the primary planning surface.
 */

import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Network,
  Trash2,
} from "lucide-react"
import * as React from "react"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntityType = "project" | "phase" | "work_package" | "todo"

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  project: "Projekt",
  phase: "Phase",
  work_package: "Arbeitspaket",
  todo: "Work-Item",
}

type ConstraintType = "FS" | "SS" | "FF" | "SF"

const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  FS: "Finish-to-Start",
  SS: "Start-to-Start",
  FF: "Finish-to-Finish",
  SF: "Start-to-Finish",
}

interface DependencyRow {
  id: string
  tenant_id: string
  from_type: EntityType
  from_id: string
  to_type: EntityType
  to_id: string
  constraint_type: ConstraintType
  lag_days: number
  created_at: string
}

interface ResolvedEnd {
  type: EntityType
  id: string
  label: string
  /** Optional sub-label for context (e.g. project name when entity is a phase). */
  sub?: string
}

interface ResolvedDependency extends DependencyRow {
  from: ResolvedEnd
  to: ResolvedEnd
}

// ---------------------------------------------------------------------------
// Label resolution
// ---------------------------------------------------------------------------

interface ProjectLite {
  id: string
  name: string
}

interface PhaseLite {
  id: string
  name: string
  project_id: string
}

interface WorkItemLite {
  id: string
  title: string
  kind: string
  project_id: string
}

function resolveLabel(
  type: EntityType,
  id: string,
  projects: Map<string, ProjectLite>,
  phases: Map<string, PhaseLite>,
  workItems: Map<string, WorkItemLite>,
): ResolvedEnd {
  if (type === "project") {
    const p = projects.get(id)
    return { type, id, label: p?.name ?? "(unbekanntes Projekt)" }
  }
  if (type === "phase") {
    const ph = phases.get(id)
    if (!ph) return { type, id, label: "(unbekannte Phase)" }
    const proj = projects.get(ph.project_id)
    return { type, id, label: ph.name, sub: proj?.name }
  }
  // work_package | todo → both live in work_items
  const wi = workItems.get(id)
  if (!wi) return { type, id, label: "(unbekanntes Work-Item)" }
  const proj = projects.get(wi.project_id)
  return { type, id, label: wi.title, sub: proj?.name }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; dependencies: ResolvedDependency[] }
  | { kind: "error"; message: string }

export function DependenciesTabClient({ projectId }: { projectId: string }) {
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [reloadCounter, setReloadCounter] = React.useState(0)
  const [filterConstraint, setFilterConstraint] = React.useState<
    ConstraintType | "all"
  >("all")
  const [filterFromType, setFilterFromType] = React.useState<
    EntityType | "all"
  >("all")
  const [filterToType, setFilterToType] = React.useState<EntityType | "all">(
    "all",
  )
  const [deleteTarget, setDeleteTarget] =
    React.useState<ResolvedDependency | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/projects/${projectId}/dependencies`, { cache: "no-store" }),
      // For label resolution we need the project, its phases, all work-items
      // that any edge could reference. Edges may cross projects within the
      // tenant (R2 allowed); fetching ALL accessible work-items + phases via
      // the existing tenant-scoped reads keeps the resolver simple.
      fetch(`/api/projects/${projectId}/work-items`, { cache: "no-store" }),
      fetch(`/api/projects/${projectId}/phases`, { cache: "no-store" }),
      fetch(`/api/projects/${projectId}`, { cache: "no-store" }),
    ])
      .then(async ([depsR, wiR, phR, pjR]) => {
        if (!depsR.ok) throw new Error(await readErrorMessage(depsR))
        if (!wiR.ok) throw new Error(await readErrorMessage(wiR))
        if (!phR.ok) throw new Error(await readErrorMessage(phR))
        if (!pjR.ok) throw new Error(await readErrorMessage(pjR))
        const depsBody = (await depsR.json()) as { dependencies: DependencyRow[] }
        const wiBody = (await wiR.json()) as {
          work_items?: WorkItemLite[]
          items?: WorkItemLite[]
        }
        const phBody = (await phR.json()) as {
          phases?: PhaseLite[]
        }
        const pjBody = (await pjR.json()) as {
          project?: ProjectLite
          id?: string
          name?: string
        }
        // Tolerant of two response shapes for work-items.
        const wiList = wiBody.work_items ?? wiBody.items ?? []
        const phList = phBody.phases ?? []
        const projList: ProjectLite[] = pjBody.project
          ? [pjBody.project]
          : pjBody.id && pjBody.name
            ? [{ id: pjBody.id, name: pjBody.name }]
            : []

        const projectsMap = new Map<string, ProjectLite>(
          projList.map((p) => [p.id, p]),
        )
        const phasesMap = new Map<string, PhaseLite>(
          phList.map((p) => [p.id, p]),
        )
        const workItemsMap = new Map<string, WorkItemLite>(
          wiList.map((w) => [w.id, w]),
        )

        const resolved: ResolvedDependency[] = depsBody.dependencies.map((d) => ({
          ...d,
          from: resolveLabel(
            d.from_type,
            d.from_id,
            projectsMap,
            phasesMap,
            workItemsMap,
          ),
          to: resolveLabel(
            d.to_type,
            d.to_id,
            projectsMap,
            phasesMap,
            workItemsMap,
          ),
        }))
        return resolved
      })
      .then((dependencies) => {
        if (!cancelled) setState({ kind: "ready", dependencies })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      })
    return () => {
      cancelled = true
    }
  }, [projectId, reloadCounter])

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/projects/${projectId}/dependencies/${deleteTarget.id}`,
        { method: "DELETE" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success("Abhängigkeit gelöscht.")
      setDeleteTarget(null)
      setReloadCounter((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade
        Abhängigkeiten …
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Fehler beim Laden</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  // Apply filters (client-side)
  const filtered = state.dependencies.filter((d) => {
    if (
      filterConstraint !== "all" &&
      d.constraint_type !== filterConstraint
    )
      return false
    if (filterFromType !== "all" && d.from_type !== filterFromType)
      return false
    if (filterToType !== "all" && d.to_type !== filterToType) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Network className="h-6 w-6" aria-hidden />
          Abhängigkeiten
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Polymorphe Abhängigkeiten zwischen Projekten, Phasen, Arbeitspaketen
          und Work-Items in diesem Projekt. Volle Gantt-Visualisierung folgt
          mit PROJ-25 (Drag-and-Drop-Stack).
        </p>
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>
            {filtered.length} von {state.dependencies.length} Abhängigkeiten
            angezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Typ (Constraint)
              </label>
              <Select
                value={filterConstraint}
                onValueChange={(v) =>
                  setFilterConstraint(v as ConstraintType | "all")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {(["FS", "SS", "FF", "SF"] as ConstraintType[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — {CONSTRAINT_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Quell-Typ
              </label>
              <Select
                value={filterFromType}
                onValueChange={(v) =>
                  setFilterFromType(v as EntityType | "all")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {(
                    ["project", "phase", "work_package", "todo"] as EntityType[]
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENTITY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Ziel-Typ
              </label>
              <Select
                value={filterToType}
                onValueChange={(v) =>
                  setFilterToType(v as EntityType | "all")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {(
                    ["project", "phase", "work_package", "todo"] as EntityType[]
                  ).map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENTITY_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {state.dependencies.length === 0 && (
        <Alert>
          <Network className="h-4 w-4" aria-hidden />
          <AlertTitle>Keine Abhängigkeiten</AlertTitle>
          <AlertDescription>
            Im aktuellen Projekt gibt es keine Vorgänger-/Nachfolger-Beziehungen
            zwischen Phasen, Arbeitspaketen oder Work-Items. Abhängigkeiten
            werden über die Gantt-/Backlog-Sicht oder per API angelegt.
          </AlertDescription>
        </Alert>
      )}

      {/* List */}
      {state.dependencies.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%]">Typ</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead className="w-[5%]"></TableHead>
                  <TableHead>Ziel</TableHead>
                  <TableHead className="w-[10%]">Lag</TableHead>
                  <TableHead className="w-[10%] text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground py-6"
                    >
                      Keine Abhängigkeiten passen zum aktuellen Filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Badge variant="outline">{d.constraint_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <EntityLabel end={d.from} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </TableCell>
                      <TableCell>
                        <EntityLabel end={d.to} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.lag_days === 0 ? "—" : `${d.lag_days}d`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(d)}
                          className="h-8 w-8 p-0"
                          aria-label="Abhängigkeit löschen"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abhängigkeit löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Abhängigkeit{" "}
              {deleteTarget && (
                <span className="font-medium">
                  &quot;{deleteTarget.from.label}&quot; →{" "}
                  &quot;{deleteTarget.to.label}&quot;
                </span>
              )}{" "}
              ({deleteTarget?.constraint_type}) wird entfernt. Der Audit-Log
              behält den Vorgang. Diese Aktion ist nicht rückgängig.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EntityLabel({ end }: { end: ResolvedEnd }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px] uppercase">
          {ENTITY_TYPE_LABELS[end.type]}
        </Badge>
        <span className="font-medium truncate">{end.label}</span>
      </div>
      {end.sub && (
        <span className="text-xs text-muted-foreground truncate">{end.sub}</span>
      )}
    </div>
  )
}

async function readErrorMessage(r: Response): Promise<string> {
  try {
    const body = await r.json()
    return body?.error?.message ?? `HTTP ${r.status}`
  } catch {
    return `HTTP ${r.status}`
  }
}
