"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { getSkill, listSkills } from "@/lib/skills/api"
import { serializeSkillMarkdown } from "@/lib/skills/serialize"
import { PROJECT_TYPE_LABELS } from "@/types/project"
import { PROJECT_METHOD_LABELS } from "@/types/project-method"
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type Skill,
  type SkillCategory,
} from "@/types/skill"

function tagLabel(labels: Record<string, string>, tag: string): string {
  return labels[tag] ?? tag
}

export function SkillsCatalogClient() {
  const [skills, setSkills] = React.useState<Skill[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)
  const [categoryFilter, setCategoryFilter] = React.useState<
    SkillCategory | "all"
  >("all")

  // read-only detail sheet
  const [selected, setSelected] = React.useState<Skill | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [detailMarkdown, setDetailMarkdown] = React.useState<string | null>(
    null
  )

  React.useEffect(() => {
    let cancelled = false
    listSkills(false)
      .then((data) => {
        if (cancelled) return
        setSkills(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const filtered = React.useMemo(
    () =>
      categoryFilter === "all"
        ? skills
        : skills.filter((s) => s.category === categoryFilter),
    [skills, categoryFilter]
  )

  const openDetail = React.useCallback(async (skill: Skill) => {
    setSelected(skill)
    setDetailMarkdown(null)
    setDetailLoading(true)
    try {
      const { skill: full, version } = await getSkill(skill.id)
      setDetailMarkdown(
        version
          ? serializeSkillMarkdown(full, version)
          : "(Keine aktive Version hinterlegt.)"
      )
    } catch (err) {
      toast.error("Skill konnte nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
      setDetailMarkdown("(Konnte nicht geladen werden.)")
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-muted-foreground">
            Katalog der im Workspace aktiven KI-Skill-Definitionen. Read-only —
            Pflege erfolgt durch Admins in den Stammdaten.
          </p>
        </div>
        <div className="w-48 space-y-1">
          <label
            htmlFor="cat-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Kategorie
          </label>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as SkillCategory | "all")}
          >
            <SelectTrigger id="cat-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {SKILL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {SKILL_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 py-10 text-center text-sm text-destructive">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setLoading(true)
              setReloadTick((t) => t + 1)
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          {skills.length === 0
            ? "Noch keine aktiven Skills im Workspace."
            : "Keine Skills in dieser Kategorie."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void openDetail(s)}
              className="text-left outline-none"
              aria-label={`Skill „${s.name}" öffnen`}
            >
              <Card className="h-full transition-colors hover:border-primary focus-within:border-primary">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <Badge variant="secondary" className="shrink-0">
                      {SKILL_CATEGORY_LABELS[s.category]}
                    </Badge>
                  </div>
                  {s.description && (
                    <CardDescription className="line-clamp-3">
                      {s.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1">
                  {s.method_tags.length === 0 &&
                  s.project_type_tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Gilt für alle Methoden und Projekttypen
                    </span>
                  ) : (
                    <>
                      {s.method_tags.map((t) => (
                        <Badge
                          key={`m-${t}`}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {tagLabel(PROJECT_METHOD_LABELS, t)}
                        </Badge>
                      ))}
                      {s.project_type_tags.map((t) => (
                        <Badge
                          key={`p-${t}`}
                          variant="outline"
                          className="text-xs font-normal"
                        >
                          {tagLabel(PROJECT_TYPE_LABELS, t)}
                        </Badge>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setDetailMarkdown(null)
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
            <SheetDescription>
              {selected?.description || "Keine Beschreibung hinterlegt."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            {selected && (
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary">
                  {SKILL_CATEGORY_LABELS[selected.category]}
                </Badge>
                {selected.method_tags.map((t) => (
                  <Badge key={`sm-${t}`} variant="outline">
                    {tagLabel(PROJECT_METHOD_LABELS, t)}
                  </Badge>
                ))}
                {selected.project_type_tags.map((t) => (
                  <Badge key={`sp-${t}`} variant="outline">
                    {tagLabel(PROJECT_TYPE_LABELS, t)}
                  </Badge>
                ))}
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Aktive Version (Rohtext)
              </p>
              {detailLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Lädt …
                </div>
              ) : (
                <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-4 font-mono text-xs">
                  {detailMarkdown ?? ""}
                </pre>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
