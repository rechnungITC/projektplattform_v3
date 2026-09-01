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
import { Input } from "@/components/ui/input"
import {
  DEPENDENCY_CONSTRAINT_LABELS,
  DEPENDENCY_CONSTRAINT_TYPES,
  DEPENDENCY_LAG_MAX,
  DEPENDENCY_LAG_MIN,
  type DependencyConstraintType,
} from "@/types/dependency"
import { DependencyApiError, updateDependency } from "@/lib/dependencies/api"

import {
  CreateDependencyDialog,
  type DependencyCandidate,
} from "./create-dependency-dialog"
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

/**
 * PROJ-155-β.1 — vorher stand hier die **vierte** Kopie der Typliste, samt
 * eigener englischer Beschriftung („Finish-to-Start"). Beides kommt jetzt aus
 * `@/types/dependency`; die Beschriftung ist deutsch und identisch mit der im
 * Gantt-Dialog.
 */
type ConstraintType = DependencyConstraintType

const CONSTRAINT_LABELS = DEPENDENCY_CONSTRAINT_LABELS

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
  | {
      kind: "ready"
      dependencies: ResolvedDependency[]
      /** Wählbare Enden für den Anlege-Dialog (PROJ-155-β.1). */
      candidates: DependencyCandidate[]
    }
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
        // Wählbare Enden für den Anlege-Dialog: Phasen und Arbeitspakete
        // bzw. Aufgaben **dieses** Projekts. Die Karten oben enthalten auch
        // Objekte fremder Projekte (Kanten dürfen die Grenze überschreiten),
        // angeboten wird aber nur das eigene — eine projektübergreifende Kante
        // ist ein eigener Vorgang und gehört nicht in diesen Dialog.
        const candidates: DependencyCandidate[] = [
          ...phList
            .filter((ph) => ph.project_id === projectId)
            .map((ph) => ({
              type: "phase" as const,
              id: ph.id,
              label: `Phase · ${ph.name}`,
            })),
          ...wiList
            .filter((wi) => wi.project_id === projectId)
            .map((wi) => ({
              // Das Kanten-Vokabular kennt `work_package` und `todo`; alles,
              // was kein Arbeitspaket ist, zählt als `todo` — dieselbe Regel
              // wie in der GET-Route dieses Endpunkts.
              type: (wi.kind === "work_package" ? "work_package" : "todo") as
                | "work_package"
                | "todo",
              id: wi.id,
              label: `${wi.kind === "work_package" ? "Arbeitspaket" : "Aufgabe"} · ${wi.title}`,
            })),
        ].sort((a, b) => a.label.localeCompare(b.label, "de"))

        return { resolved, candidates }
      })
      .then(({ resolved, candidates }) => {
        if (!cancelled) {
          setState({ kind: "ready", dependencies: resolved, candidates })
        }
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
        {/* PROJ-155-β.1 — der einzige Weg zu einer Kante in einem Projekt
            ohne Termine: im Diagramm gibt es dort keine Balken zu ziehen. */}
        <div className="mt-3">
          <CreateDependencyDialog
            projectId={projectId}
            candidates={state.candidates}
            onCreated={() => setReloadCounter((c) => c + 1)}
          />
        </div>
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
                  {DEPENDENCY_CONSTRAINT_TYPES.map((c) => (
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
                        <InlineConstraintCell
                          projectId={projectId}
                          dependency={d}
                          onChanged={() => setReloadCounter((c) => c + 1)}
                        />
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
                        <InlineLagCell
                          projectId={projectId}
                          dependency={d}
                          onChanged={() => setReloadCounter((c) => c + 1)}
                        />
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

/**
 * Typ inline ändern.
 *
 * Bewusst ein `Select` direkt in der Zeile und kein Dialog: es ist **ein**
 * Feld, und ein Dialog wäre schwerer als die Handlung. Der Schreibweg ist
 * derselbe wie im Gantt-Dialog (`lib/dependencies/api`), damit nicht zwei
 * Fehlerübersetzungen nebeneinander entstehen.
 */
function InlineConstraintCell({
  projectId,
  dependency,
  onChanged,
}: {
  projectId: string
  dependency: ResolvedDependency
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  async function handleChange(value: string) {
    if (value === dependency.constraint_type) return
    setBusy(true)
    try {
      await updateDependency(projectId, dependency.id, {
        constraint_type: value as DependencyConstraintType,
      })
      toast.success("Typ geändert")
      onChanged()
    } catch (err) {
      toast.error("Änderung fehlgeschlagen", {
        description:
          err instanceof DependencyApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Select
      value={dependency.constraint_type}
      onValueChange={handleChange}
      disabled={busy}
    >
      <SelectTrigger
        className="h-8 w-[9.5rem] text-xs"
        aria-label={`Typ der Abhängigkeit ${dependency.from.label} → ${dependency.to.label}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DEPENDENCY_CONSTRAINT_TYPES.map((t) => (
          <SelectItem key={t} value={t}>
            {DEPENDENCY_CONSTRAINT_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Abstand inline ändern — geschrieben wird beim Verlassen des Feldes oder mit
 * Enter, nicht bei jedem Tastendruck. Sonst entstünde je Ziffer eine Anfrage
 * und je Ziffer eine Audit-Zeile.
 */
function InlineLagCell({
  projectId,
  dependency,
  onChanged,
}: {
  projectId: string
  dependency: ResolvedDependency
  onChanged: () => void
}) {
  const [text, setText] = React.useState(String(dependency.lag_days ?? 0))
  const [busy, setBusy] = React.useState(false)

  async function commit() {
    const value = Number.parseInt(text, 10)
    if (
      text.trim() === "" ||
      !Number.isFinite(value) ||
      value < DEPENDENCY_LAG_MIN ||
      value > DEPENDENCY_LAG_MAX
    ) {
      // Ungültige Eingabe verwirft sich selbst statt eine Fehlermeldung zu
      // erzeugen — der alte Wert steht sofort wieder da.
      setText(String(dependency.lag_days ?? 0))
      return
    }
    if (value === (dependency.lag_days ?? 0)) return
    setBusy(true)
    try {
      await updateDependency(projectId, dependency.id, { lag_days: value })
      toast.success("Abstand geändert")
      onChanged()
    } catch (err) {
      setText(String(dependency.lag_days ?? 0))
      toast.error("Änderung fehlgeschlagen", {
        description:
          err instanceof DependencyApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Input
      type="number"
      inputMode="numeric"
      value={text}
      min={DEPENDENCY_LAG_MIN}
      max={DEPENDENCY_LAG_MAX}
      disabled={busy}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          void commit()
        }
      }}
      className="h-8 w-20 text-xs"
      aria-label={`Abstand in Tagen für ${dependency.from.label} → ${dependency.to.label}`}
    />
  )
}
