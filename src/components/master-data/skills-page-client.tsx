"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { SkillFormDialog } from "@/components/master-data/skill-form-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { listSkills, toggleSkillActive } from "@/lib/skills/api"
import { PROJECT_TYPE_LABELS, type ProjectType } from "@/types/project"
import {
  PROJECT_METHOD_LABELS,
  type ProjectMethod,
} from "@/types/project-method"
import { SKILL_CATEGORY_LABELS, type Skill } from "@/types/skill"

function TagBadges({
  tags,
  labels,
}: {
  tags: string[]
  labels: Record<string, string>
}) {
  if (tags.length === 0) {
    return <span className="text-xs text-muted-foreground">Alle</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t} variant="outline" className="text-xs font-normal">
          {labels[t] ?? t}
        </Badge>
      ))}
    </div>
  )
}

export function SkillsPageClient() {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [skills, setSkills] = React.useState<Skill[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [showInactive, setShowInactive] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    listSkills(showInactive)
      .then((data) => {
        if (cancelled) return
        setSkills(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof Error ? err.message : "Unbekannter Fehler"
        setError(message)
        toast.error("Skills konnten nicht geladen werden", {
          description: message,
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showInactive, reloadTick])

  const triggerReload = () => {
    setLoading(true)
    setReloadTick((t) => t + 1)
  }

  const onToggleActive = async (skill: Skill, next: boolean) => {
    setTogglingId(skill.id)
    // optimistic
    setSkills((prev) =>
      prev.map((s) => (s.id === skill.id ? { ...s, is_active: next } : s))
    )
    try {
      await toggleSkillActive(skill.id, next)
      toast.success(next ? "Skill aktiviert" : "Skill deaktiviert")
      // when hiding inactive, a deactivated skill drops off the list
      if (!showInactive && !next) {
        setSkills((prev) => prev.filter((s) => s.id !== skill.id))
      }
    } catch (err) {
      // revert
      setSkills((prev) =>
        prev.map((s) =>
          s.id === skill.id ? { ...s, is_active: !next } : s
        )
      )
      toast.error("Status konnte nicht geändert werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-muted-foreground">
            Tenant-Katalog wiederverwendbarer KI-Skill-Definitionen (Markdown +
            Metadaten), versioniert mit genau einer aktiven Version. Nur Admins
            pflegen; PMs sehen den Katalog read-only.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Neuer Skill
          </Button>
        )}
      </header>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={(v) => {
              setLoading(true)
              setShowInactive(v)
            }}
          />
          <Label htmlFor="show-inactive" className="text-sm font-normal">
            Inaktive anzeigen
          </Label>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 py-10 text-center text-sm text-destructive">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={triggerReload}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {isAdmin
            ? "Noch keine Skills. Lege den ersten an, um wiederverwendbare KI-Definitionen zu pflegen."
            : "Noch keine aktiven Skills hinterlegt."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-32">Kategorie</TableHead>
                <TableHead className="hidden md:table-cell">Methoden</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Projekttypen
                </TableHead>
                <TableHead className="w-28">Version</TableHead>
                <TableHead className="hidden sm:table-cell w-32">
                  Aktualisiert
                </TableHead>
                {isAdmin && (
                  <TableHead className="w-24 text-center">Aktiv</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/stammdaten/skills/${s.id}`}
                      className="hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {s.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">
                      {s.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {SKILL_CATEGORY_LABELS[s.category]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <TagBadges
                      tags={s.method_tags}
                      labels={
                        PROJECT_METHOD_LABELS as Record<ProjectMethod, string>
                      }
                    />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <TagBadges
                      tags={s.project_type_tags}
                      labels={
                        PROJECT_TYPE_LABELS as Record<ProjectType, string>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {s.current_version_id ? (
                      <Badge variant="outline">aktive Version</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        keine
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {new Date(s.updated_at).toLocaleDateString("de-DE")}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-center">
                      <Switch
                        checked={s.is_active}
                        disabled={togglingId === s.id}
                        onCheckedChange={(next) => void onToggleActive(s, next)}
                        aria-label={
                          s.is_active
                            ? `Skill „${s.name}" deaktivieren`
                            : `Skill „${s.name}" aktivieren`
                        }
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SkillFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
