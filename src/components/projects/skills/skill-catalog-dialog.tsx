"use client"

/**
 * PROJ-78 — reusable multi-select catalog picker.
 *
 * Used twice: in the wizard's "Skills" step ("Aus Katalog hinzufügen") and in
 * the project room's "Projekt-Skills" tab ("Hinzufügen"). The caller passes the
 * candidate list (already reduced to skills the project does not have yet) and
 * receives the chosen ids; everything the picker knows about persistence is
 * therefore nothing — it is a pure selection surface.
 */

import { Search } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type Skill,
  type SkillCategory,
} from "@/types/skill"

const ALL_CATEGORIES = "__all__"

interface SkillCatalogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active catalog skills the project does not have yet. */
  candidates: Skill[]
  /** Called with the chosen skill ids; the dialog closes itself afterwards. */
  onConfirm: (skillIds: string[]) => void | Promise<void>
  /** Disables the confirm button while the caller persists. */
  busy?: boolean
}

function skillTags(skill: Skill): string[] {
  return [...skill.method_tags, ...skill.project_type_tags]
}

function matches(skill: Skill, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    skill.name.toLowerCase().includes(needle) ||
    skill.description.toLowerCase().includes(needle) ||
    skillTags(skill).some((tag) => tag.toLowerCase().includes(needle))
  )
}

export function SkillCatalogDialog({
  open,
  onOpenChange,
  candidates,
  onConfirm,
  busy = false,
}: SkillCatalogDialogProps) {
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES)
  const [selected, setSelected] = React.useState<string[]>([])

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        // Reset in the close handler (never in an effect) so re-opening the
        // dialog always starts from a clean selection.
        setQuery("")
        setCategory(ALL_CATEGORIES)
        setSelected([])
      }
      onOpenChange(next)
    },
    [onOpenChange],
  )

  const visible = candidates.filter(
    (s) =>
      (category === ALL_CATEGORIES || s.category === (category as SkillCategory)) &&
      matches(s, query),
  )

  const toggle = React.useCallback((id: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    )
  }, [])

  async function confirm() {
    if (selected.length === 0) return
    await onConfirm(selected)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Skills aus dem Katalog hinzufügen</DialogTitle>
          <DialogDescription>
            Wähle zusätzliche Skills aus dem Mandanten-Katalog. Es werden nur
            aktive Skills angeboten, die dem Projekt noch nicht zugeordnet sind.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nach Name, Beschreibung oder Tag filtern"
              aria-label="Skills filtern"
              className="pl-8"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-52" aria-label="Kategorie filtern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Alle Kategorien</SelectItem>
              {SKILL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {SKILL_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Alle passenden Skills sind bereits zugeordnet.
            </p>
          ) : visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Kein Skill passt zu diesem Filter.
            </p>
          ) : (
            visible.map((skill) => {
              const checked = selected.includes(skill.id)
              const inputId = `skill-pick-${skill.id}`
              return (
                <div
                  key={skill.id}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <Checkbox
                    id={inputId}
                    checked={checked}
                    onCheckedChange={(v) => toggle(skill.id, v === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label
                      htmlFor={inputId}
                      className="flex flex-wrap items-center gap-2 font-medium"
                    >
                      {skill.name}
                      <Badge variant="secondary">
                        {SKILL_CATEGORY_LABELS[skill.category]}
                      </Badge>
                    </Label>
                    {skill.description ? (
                      <p className="text-sm text-muted-foreground">
                        {skill.description}
                      </p>
                    ) : null}
                    {skillTags(skill).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {skillTags(skill).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[11px] font-normal"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.length} ausgewählt
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={() => void confirm()}
              disabled={selected.length === 0 || busy}
            >
              Hinzufügen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
