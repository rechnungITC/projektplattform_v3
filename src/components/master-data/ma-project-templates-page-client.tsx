"use client"

import { LayoutTemplate, ListTree, RotateCcw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DEAL_SIDE_LABELS,
  type DealSide,
  listMaProjectTemplates,
  type MaProjectTemplate,
  type MaTemplateRaci,
  type MaTemplateTask,
  type MaTemplateTaskPriority,
  type RaciLetter,
} from "@/lib/ma-project/templates-api"

// PROJ-Y-96e — priority label + tint for the read-only tasks preview.
const TASK_PRIORITY_LABELS: Record<MaTemplateTaskPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
}
const TASK_PRIORITY_TINT: Record<MaTemplateTaskPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "",
  high: "border-amber-500/50 text-amber-700 dark:text-amber-400",
  critical: "border-destructive/70 text-destructive",
}

// PROJ-Y-96b (AC-Y96b.6) — read-only RACI matrix.
const RACI_LETTER_VARIANT: Record<RaciLetter, "default" | "secondary" | "outline"> = {
  R: "default",
  A: "default",
  C: "secondary",
  I: "outline",
}
const RACI_LETTER_LABEL: Record<RaciLetter, string> = {
  R: "R — Responsible",
  A: "A — Accountable",
  C: "C — Consulted",
  I: "I — Informed",
}

function raciTargetLabel(
  raci: MaTemplateRaci,
  template: MaProjectTemplate
): { primary: string; sublabel: string } {
  if (raci.target_type === "workstream") {
    const ws = template.workstreams.find(
      (w) => w.workstream_key === raci.target_key
    )
    return {
      primary: ws?.label ?? raci.target_key,
      sublabel: `Workstream · ${raci.target_key}`,
    }
  }
  const del = template.deliverables.find(
    (d) => d.deliverable_key === raci.target_key
  )
  return {
    primary: del?.name ?? raci.target_key,
    sublabel: `Deliverable · ${raci.target_key}`,
  }
}

/** Sorted rows: workstreams first, then deliverables; each block by sort_order. */
function sortedRaciRows(rows: MaTemplateRaci[]): MaTemplateRaci[] {
  return [...rows].sort((a, b) => {
    if (a.target_type !== b.target_type) {
      return a.target_type === "workstream" ? -1 : 1
    }
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    if (a.target_key !== b.target_key) {
      return a.target_key.localeCompare(b.target_key)
    }
    return a.role_key.localeCompare(b.role_key)
  })
}

/**
 * PROJ-96 — read-only tenant catalog of M&A project templates.
 *
 * GET lazily seeds the Buy-Side default on first access (AC1). Templates are
 * applied to a project at creation time (wizard) or via the project's
 * apply-template surface — copy-on-create. A deep template editor
 * (create/reorder/field-edit) is intentionally out of MVP scope (PROJ-Y-96d).
 */
export function MaProjectTemplatesPageClient() {
  const [templates, setTemplates] = React.useState<MaProjectTemplate[]>([])
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    setLoading(true)
    try {
      // GET lazily seeds the Buy-Side default on first access.
      setTemplates(await listMaProjectTemplates())
    } catch (err) {
      toast.error("Projekt-Vorlagen konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch on mount
    void reload()
  }, [reload])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Projekt-Vorlagen (M&amp;A)
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tenant-weiter Katalog wiederverwendbarer M&amp;A-Projektstrukturen.
            Bei der Projektanlage kann eine Vorlage gewählt werden; Phasen,
            Workstreams und Deliverables werden dann ins neue Projekt kopiert
            (Copy-on-create) und sind danach projektindividuell anpassbar.
            Spätere Vorlagen-Änderungen wirken nicht rückwirkend.
          </p>
        </div>
        <Button variant="outline" onClick={() => void reload()} disabled={loading}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Aktualisieren
        </Button>
      </header>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Noch keine Vorlagen vorhanden.
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((t) => (
            <article key={t.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutTemplate
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden
                  />
                  <h2 className="font-medium">{t.name}</h2>
                  <Badge variant="secondary">
                    {DEAL_SIDE_LABELS[t.deal_side as DealSide] ?? t.deal_side}
                  </Badge>
                  <Badge variant="outline">v{t.version}</Badge>
                  {!t.is_active && <Badge variant="outline">inaktiv</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.workstreams.length} Workstreams · {t.deliverables.length}{" "}
                  Deliverables · {countTasks(t.tasks).tasks} Aufgaben
                  {countTasks(t.tasks).subtasks > 0 &&
                    ` (${countTasks(t.tasks).subtasks} Sub-Aufgaben)`}
                  {t.raci.length > 0 && ` · ${t.raci.length} RACI`}
                </span>
              </div>

              {t.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t.description}
                </p>
              )}

              {t.workstreams.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {t.workstreams.map((ws) => {
                    const dels = t.deliverables.filter(
                      (d) => d.workstream_key === ws.workstream_key
                    )
                    return (
                      <li
                        key={ws.id}
                        className="rounded border bg-muted/10 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{ws.label}</span>
                        {dels.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                            {dels.map((d) => (
                              <li key={d.id}>{d.name}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {t.tasks.length > 0 && (
                <TemplateTasksSection tasks={t.tasks} />
              )}

              {/* PROJ-Y-96b (AC-Y96b.6) — read-only RACI matrix per template. */}
              <section
                className="mt-4"
                aria-label={`RACI-Zuordnungen für ${t.name}`}
                data-testid="raci-matrix-section"
              >
                <h3 className="text-sm font-medium text-muted-foreground">
                  RACI-Zuordnungen
                </h3>
                {t.raci.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keine RACI-Zuweisungen im Template hinterlegt.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ziel</TableHead>
                          <TableHead>Rolle</TableHead>
                          <TableHead className="w-24">R/A/C/I</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedRaciRows(t.raci).map((raci) => {
                          const target = raciTargetLabel(raci, t)
                          return (
                            <TableRow key={raci.id}>
                              <TableCell>
                                <div className="text-sm">{target.primary}</div>
                                <div className="text-xs text-muted-foreground">
                                  {target.sublabel}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {raci.role_key}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={RACI_LETTER_VARIANT[raci.raci_letter]}
                                  title={RACI_LETTER_LABEL[raci.raci_letter]}
                                >
                                  {raci.raci_letter}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

// PROJ-Y-96e — pure helper: split tasks[] into top-level count vs subtask count.
export function countTasks(tasks: MaTemplateTask[]): {
  tasks: number
  subtasks: number
} {
  let taskCount = 0
  let subtaskCount = 0
  for (const t of tasks) {
    if (t.target_kind === "subtask") subtaskCount++
    else taskCount++
  }
  return { tasks: taskCount, subtasks: subtaskCount }
}

/**
 * PROJ-Y-96e — read-only preview of a template's task rows.
 * Groups by parent (top-level tasks + their subtasks). Waisen-subtasks (parent
 * missing in the same array) fall back to a "Ohne Parent" bucket so the admin
 * sees them at all — Waisen were never possible via the seed, but PROJ-Y-96d
 * custom-CRUD could produce them.
 */
function TemplateTasksSection({ tasks }: { tasks: MaTemplateTask[] }) {
  const parents = tasks.filter((t) => t.target_kind === "task")
  const subtasks = tasks.filter((t) => t.target_kind === "subtask")

  const orphanSubtasks = subtasks.filter(
    (s) => !parents.some((p) => p.task_key === s.parent_task_key)
  )

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <ListTree className="h-3.5 w-3.5" aria-hidden />
        Vorbereitete Aufgaben ({parents.length}
        {subtasks.length > 0 && `, ${subtasks.length} Sub-Aufgaben`})
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {parents.map((p) => {
          const kids = subtasks.filter((s) => s.parent_task_key === p.task_key)
          return (
            <li
              key={p.id}
              className="rounded border bg-muted/10 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.title}</span>
                {p.priority && (
                  <Badge
                    variant="outline"
                    className={TASK_PRIORITY_TINT[p.priority]}
                  >
                    {TASK_PRIORITY_LABELS[p.priority]}
                  </Badge>
                )}
                {p.workstream_key && (
                  <Badge variant="secondary" className="font-normal">
                    {p.workstream_key}
                  </Badge>
                )}
                {p.phase_key && (
                  <Badge variant="secondary" className="font-normal">
                    Phase {p.phase_key}
                  </Badge>
                )}
                {p.due_date_offset_days !== null && (
                  <span className="text-xs text-muted-foreground">
                    +{p.due_date_offset_days} Tage
                  </span>
                )}
              </div>
              {p.description && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.description}
                </p>
              )}
              {kids.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                  {kids.map((s) => (
                    <li key={s.id}>
                      {s.title}
                      {s.priority && (
                        <span className="ml-1 text-[10px] uppercase tracking-wide">
                          · {TASK_PRIORITY_LABELS[s.priority]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
        {orphanSubtasks.length > 0 && (
          <li className="rounded border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            <div className="font-medium text-amber-700 dark:text-amber-400">
              Ohne Parent-Aufgabe ({orphanSubtasks.length})
            </div>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              {orphanSubtasks.map((s) => (
                <li key={s.id}>{s.title}</li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </div>
  )
}
