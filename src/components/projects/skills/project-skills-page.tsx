"use client"

/**
 * PROJ-78 — project room tab "Projekt-Skills".
 *
 * Read for every project member; add / remove / reconcile only for project
 * lead or tenant admin (the server enforces the same rule with a 403 — the UI
 * merely avoids showing dead buttons).
 *
 * "Skills abgleichen" is deliberately triggered and strictly ADDITIVE: it only
 * offers skills that are not assigned yet and never removes anything (Tech
 * Design D1/D4). It covers the two reachable triggers — a grown catalog and a
 * method that was only set after project creation.
 */

import {
  BookOpen,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import Link from "next/link"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useProjectSkills } from "@/hooks/use-project-skills"
import {
  assignProjectSkills,
  removeProjectSkill,
  resolveProjectSkillCandidates,
} from "@/lib/project-skills/api"
import { listSkills } from "@/lib/skills/api"
import {
  SKILL_ASSIGNMENT_SOURCE_LABELS,
  isAutoSource,
  type ProjectSkillWithSkill,
  type ResolvedSkillCandidate,
} from "@/types/project-skill"
import { SKILL_CATEGORY_LABELS, type Skill } from "@/types/skill"

import { SkillCatalogDialog } from "./skill-catalog-dialog"

export function ProjectSkillsPage({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")
  const { projectSkills, loading, error, refresh } = useProjectSkills(projectId)

  const [catalog, setCatalog] = React.useState<Skill[]>([])
  const [addOpen, setAddOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [removeTarget, setRemoveTarget] =
    React.useState<ProjectSkillWithSkill | null>(null)
  const [reconcileOpen, setReconcileOpen] = React.useState(false)
  const [reconciling, setReconciling] = React.useState(false)
  const [candidates, setCandidates] = React.useState<ResolvedSkillCandidate[]>(
    [],
  )

  React.useEffect(() => {
    let cancelled = false
    void listSkills()
      .then((rows) => {
        if (!cancelled) setCatalog(rows.filter((s) => s.is_active))
      })
      .catch(() => {
        // Fail-soft: only the "Hinzufügen" picker degrades (stays empty).
      })
    return () => {
      cancelled = true
    }
  }, [])

  const assignedIds = new Set(projectSkills.map((ps) => ps.skill_id))
  const addCandidates = catalog.filter((s) => !assignedIds.has(s.id))

  async function handleAdd(skillIds: string[]) {
    setBusy(true)
    try {
      await assignProjectSkills(
        projectId,
        skillIds.map((skill_id) => ({
          skill_id,
          assignment_source: "manual_pm" as const,
        })),
      )
      await refresh()
      toast.success(
        skillIds.length === 1
          ? "Skill zugeordnet"
          : `${skillIds.length} Skills zugeordnet`,
      )
    } catch (err) {
      toast.error("Skills konnten nicht zugeordnet werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    const target = removeTarget
    if (!target) return
    setRemoveTarget(null)
    setBusy(true)
    try {
      await removeProjectSkill(projectId, target.skill_id)
      await refresh()
      toast.success("Skill entfernt", {
        description: isAutoSource(target.assignment_source)
          ? "Die automatische Zuordnung wurde manuell überschrieben und protokolliert."
          : undefined,
      })
    } catch (err) {
      toast.error("Skill konnte nicht entfernt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleReconcile() {
    setReconciling(true)
    try {
      const rows = await resolveProjectSkillCandidates(projectId)
      setCandidates(rows)
      setReconcileOpen(true)
    } catch (err) {
      toast.error("Abgleich fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setReconciling(false)
    }
  }

  async function acceptCandidate(candidate: ResolvedSkillCandidate) {
    setBusy(true)
    try {
      await assignProjectSkills(projectId, [
        {
          skill_id: candidate.skill.id,
          assignment_source: candidate.assignment_source,
        },
      ])
      setCandidates((prev) =>
        prev.filter((c) => c.skill.id !== candidate.skill.id),
      )
      await refresh()
      toast.success(`„${candidate.skill.name}“ zugeordnet`)
    } catch (err) {
      toast.error("Vorschlag konnte nicht übernommen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Projekt-Skills
          </h1>
          <p className="text-sm text-muted-foreground">
            Diese Skills stehen der KI-Assistenz in diesem Projekt als
            Arbeitsanweisung zur Verfügung. Sie wurden bei der Projektanlage aus
            Methode, Projekttyp und den übergreifenden Skills vorgeschlagen.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleReconcile()}
              disabled={reconciling || busy}
            >
              {reconciling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              Skills abgleichen
            </Button>
            <Button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={busy}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Hinzufügen
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>Skills konnten nicht geladen werden</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
            >
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      ) : projectSkills.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-12 text-center">
            <Sparkles
              className="mx-auto h-6 w-6 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Diesem Projekt sind noch keine Skills zugeordnet.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleReconcile()}
                  disabled={reconciling}
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                  Passende Skills vorschlagen
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link href="/skills">
                  <BookOpen className="mr-2 h-4 w-4" aria-hidden />
                  Skill-Katalog ansehen
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {projectSkills.map((ps) => (
            <li key={ps.id}>
              <Card className={ps.skill?.is_active === false ? "opacity-60" : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        {ps.skill?.name ?? "Unbekannter Skill"}
                        {ps.skill ? (
                          <Badge variant="secondary">
                            {SKILL_CATEGORY_LABELS[ps.skill.category]}
                          </Badge>
                        ) : null}
                        <Badge variant="outline">
                          {SKILL_ASSIGNMENT_SOURCE_LABELS[ps.assignment_source]}
                        </Badge>
                        {ps.skill?.is_active === false ? (
                          <Badge variant="destructive">inaktiv</Badge>
                        ) : null}
                      </CardTitle>
                      {ps.skill?.description ? (
                        <CardDescription>
                          {ps.skill.description}
                        </CardDescription>
                      ) : null}
                    </div>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(ps)}
                        disabled={busy}
                        aria-label={`Skill ${ps.skill?.name ?? ""} entfernen`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                {ps.skill?.is_active === false ? (
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground">
                      Dieser Skill wurde im Katalog deaktiviert. Die Zuordnung
                      bleibt bestehen, die KI-Assistenz überspringt ihn.
                    </p>
                  </CardContent>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SkillCatalogDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidates={addCandidates}
        onConfirm={handleAdd}
        busy={busy}
      />

      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vorschläge aus dem Abgleich</DialogTitle>
            <DialogDescription>
              Der Abgleich ist rein additiv: er schlägt nur Skills vor, die noch
              nicht zugeordnet sind, und entfernt niemals eine bestehende
              Zuordnung.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Alles aktuell — es gibt keine zusätzlichen passenden Skills.
              </p>
            ) : (
              candidates.map((c) => (
                <div
                  key={c.skill.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {c.skill.name}
                      <Badge variant="secondary">
                        {SKILL_CATEGORY_LABELS[c.skill.category]}
                      </Badge>
                    </p>
                    {c.skill.description ? (
                      <p className="text-sm text-muted-foreground">
                        {c.skill.description}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Vorgeschlagen über: {c.reason}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void acceptCandidate(c)}
                    disabled={busy}
                  >
                    Übernehmen
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReconcileOpen(false)}
            >
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skill entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{removeTarget?.skill?.name ?? "Dieser Skill"}“ wird diesem
              Projekt nicht mehr zur Verfügung stehen.
              {removeTarget && isAutoSource(removeTarget.assignment_source)
                ? " Die Zuordnung war automatisch aufgelöst — das Entfernen wird als manuelle Überschreibung protokolliert."
                : ""}{" "}
              Der Skill selbst bleibt im Katalog erhalten und kann jederzeit
              erneut zugeordnet werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()}>
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
