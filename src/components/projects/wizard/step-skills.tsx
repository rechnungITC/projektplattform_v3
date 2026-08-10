"use client"

/**
 * PROJ-78 — wizard step "Skills".
 *
 * Resolves the matching skill set from the chosen method + project type (plus
 * every cross-cutting skill) and presents it as pre-checked suggestion cards.
 * The PM may de-select any suggestion and add further skills from the catalog;
 * finishing with ZERO skills is explicitly allowed (soft hint only).
 *
 * The selection is mirrored into the draft's `skills.assignments` block on
 * every change; `finalize` reads it and calls `assign_project_skills`
 * best-effort. Nothing is written to the database from this step.
 *
 * Empty catalog is the NORMAL case, not an error: a fresh tenant has no
 * tagged skills yet, so the step shows a hint plus a deep link into the
 * catalog and stays fully skippable.
 */

import { BookOpen, Plus, Sparkles, TriangleAlert } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { useFormContext, useWatch } from "react-hook-form"

import { SkillCatalogDialog } from "@/components/projects/skills/skill-catalog-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { resolveSkillsForProject } from "@/lib/project-skills/resolve"
import { listSkills } from "@/lib/skills/api"
import type { SkillAssignmentSource } from "@/types/project-skill"
import { SKILL_CATEGORY_LABELS, type Skill } from "@/types/skill"
import type { WizardData } from "@/types/wizard"

interface SkillRow {
  skill: Skill
  assignment_source: SkillAssignmentSource
  reason: string
}

export function StepSkills() {
  const form = useFormContext<WizardData>()

  // PROJ-67 AC-4 — `useWatch`, never `form.watch(...)`.
  const method =
    useWatch({ control: form.control, name: "project_method" }) ?? null
  const projectType =
    useWatch({ control: form.control, name: "project_type" }) ?? null

  const [catalog, setCatalog] = React.useState<Skill[]>([])
  const [catalogLoaded, setCatalogLoaded] = React.useState(false)
  const [catalogError, setCatalogError] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  // Restore a previous visit (the step remounts when navigating back and
  // forth). `null` selection means "nothing chosen yet" → every suggestion
  // starts checked.
  const initialAssignments = React.useMemo(
    () => form.getValues().skills?.assignments ?? [],
    [form],
  )
  const [manualIds, setManualIds] = React.useState<string[]>(() =>
    initialAssignments
      .filter((a) => a.assignment_source === "manual_pm")
      .map((a) => a.skill_id),
  )
  const [selectedIds, setSelectedIds] = React.useState<Set<string> | null>(() =>
    initialAssignments.length > 0
      ? new Set(initialAssignments.map((a) => a.skill_id))
      : null,
  )

  React.useEffect(() => {
    let cancelled = false
    void listSkills()
      .then((rows) => {
        if (!cancelled) setCatalog(rows.filter((s) => s.is_active))
      })
      .catch((err: unknown) => {
        // Fail-soft: a project can be created without skills and the set is
        // repairable later in the project room.
        if (!cancelled) {
          setCatalogError(
            err instanceof Error
              ? err.message
              : "Skill-Katalog konnte nicht geladen werden.",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const suggestions = React.useMemo(
    () => resolveSkillsForProject({ skills: catalog, method, projectType }),
    [catalog, method, projectType],
  )

  const rows = React.useMemo<SkillRow[]>(() => {
    const suggested = new Set(suggestions.map((c) => c.skill.id))
    const manualRows = manualIds
      .filter((id) => !suggested.has(id))
      .map((id) => catalog.find((s) => s.id === id))
      .filter((s): s is Skill => Boolean(s))
      .map((skill) => ({
        skill,
        assignment_source: "manual_pm" as SkillAssignmentSource,
        reason: "Manuell aus Katalog",
      }))
    return [...suggestions, ...manualRows]
  }, [suggestions, manualIds, catalog])

  const isChecked = React.useCallback(
    (id: string) => (selectedIds ? selectedIds.has(id) : true),
    [selectedIds],
  )

  const assignments = React.useMemo(
    () =>
      rows
        .filter((r) => isChecked(r.skill.id))
        .map((r) => ({
          skill_id: r.skill.id,
          assignment_source: r.assignment_source,
        })),
    [rows, isChecked],
  )

  // Mirror the derived selection into the draft payload. `setValue` is not
  // React state, so this is not a set-state-in-effect. Skipped until the
  // catalog resolved so a slow/failed fetch never wipes a stored choice.
  React.useEffect(() => {
    if (!catalogLoaded || catalogError) return
    form.setValue("skills", { assignments }, { shouldDirty: false })
  }, [assignments, catalogLoaded, catalogError, form])

  const toggle = React.useCallback(
    (id: string, checked: boolean) => {
      setSelectedIds((prev) => {
        const base = prev ?? new Set(rows.map((r) => r.skill.id))
        const next = new Set(base)
        if (checked) next.add(id)
        else next.delete(id)
        return next
      })
    },
    [rows],
  )

  const addFromCatalog = React.useCallback(
    (ids: string[]) => {
      setManualIds((prev) => [...new Set([...prev, ...ids])])
      setSelectedIds((prev) => {
        const base = prev ?? new Set(rows.map((r) => r.skill.id))
        return new Set([...base, ...ids])
      })
    },
    [rows],
  )

  const rowIds = new Set(rows.map((r) => r.skill.id))
  const candidates = catalog.filter((s) => !rowIds.has(s.id))
  const selectedCount = assignments.length

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Skills sind wiederverwendbare Arbeitsanweisungen für die KI-Assistenz.
        Passende Skills wurden aus Methode, Projekttyp und den übergreifenden
        Skills des Mandanten vorgeschlagen — du kannst sie abwählen oder weitere
        aus dem Katalog ergänzen. Das Skill-Set lässt sich später im Projektraum
        jederzeit ändern.
      </p>

      {catalogError ? (
        <Alert>
          <TriangleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>Skill-Katalog nicht verfügbar</AlertTitle>
          <AlertDescription>
            {catalogError} Das Projekt lässt sich trotzdem anlegen; die Skills
            kannst du im Projektraum unter „Projekt-Skills“ nachtragen.
          </AlertDescription>
        </Alert>
      ) : null}

      {!catalogError ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {selectedCount} von {rows.length} Skills ausgewählt
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDialogOpen(true)}
            disabled={!catalogLoaded || candidates.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Aus Katalog hinzufügen
          </Button>
        </div>
      ) : null}

      {!catalogLoaded ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : catalogError ? null : rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <Sparkles
              className="mx-auto h-6 w-6 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Noch keine Skills für diese Kombination konfiguriert.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/stammdaten/skills" target="_blank">
                <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                Skill-Katalog öffnen
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const inputId = `wizard-skill-${row.skill.id}`
            const checked = isChecked(row.skill.id)
            return (
              <li key={row.skill.id}>
                <Card className={checked ? undefined : "opacity-60"}>
                  <CardContent className="flex items-start gap-3 py-4">
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      onCheckedChange={(v) => toggle(row.skill.id, v === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label
                        htmlFor={inputId}
                        className="flex flex-wrap items-center gap-2 font-medium"
                      >
                        {row.skill.name}
                        <Badge variant="secondary">
                          {SKILL_CATEGORY_LABELS[row.skill.category]}
                        </Badge>
                      </Label>
                      {row.skill.description ? (
                        <p className="text-sm text-muted-foreground">
                          {row.skill.description}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Vorgeschlagen über: {row.reason}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {catalogLoaded && !catalogError && rows.length > 0 && selectedCount === 0 ? (
        <Alert>
          <TriangleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>Kein Skill ausgewählt</AlertTitle>
          <AlertDescription>
            Das Projekt wird ohne Skills angelegt — die KI-Assistenz arbeitet
            dann ohne projektspezifische Arbeitsanweisung. Du kannst fortfahren
            und Skills jederzeit im Projektraum ergänzen.
          </AlertDescription>
        </Alert>
      ) : null}

      <SkillCatalogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidates={candidates}
        onConfirm={addFromCatalog}
      />
    </div>
  )
}
