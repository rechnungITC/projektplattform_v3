"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { SkillTagPicker } from "@/components/master-data/skill-tag-picker"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { createSkill } from "@/lib/skills/api"
import { PROJECT_TYPE_LABELS, PROJECT_TYPES } from "@/types/project"
import {
  PROJECT_METHOD_LABELS,
  PROJECT_METHODS,
} from "@/types/project-method"
import {
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  type SkillCategory,
} from "@/types/skill"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SLUG_RE = /^[a-z0-9-]+$/

const METHOD_OPTIONS = PROJECT_METHODS.map((m) => ({
  value: m,
  label: PROJECT_METHOD_LABELS[m],
}))

const TYPE_OPTIONS = PROJECT_TYPES.map((t) => ({
  value: t,
  label: PROJECT_TYPE_LABELS[t],
}))

/**
 * PROJ-76 — create a new Skill (metadata + empty initial v1 draft).
 * On success navigates to the new skill's detail page.
 */
export function SkillFormDialog({ open, onOpenChange }: Props) {
  const router = useRouter()

  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [category, setCategory] = React.useState<SkillCategory>("cross_cutting")
  const [methodTags, setMethodTags] = React.useState<string[]>([])
  const [typeTags, setTypeTags] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [slugError, setSlugError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form reset when the dialog opens
    setName("")
    setSlug("")
    setDescription("")
    setCategory("cross_cutting")
    setMethodTags([])
    setTypeTags([])
    setError(null)
    setSlugError(null)
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSlugError(null)

    if (!name.trim()) {
      setError("Name ist erforderlich.")
      return
    }
    if (!SLUG_RE.test(slug.trim())) {
      setSlugError("Nur Kleinbuchstaben, Ziffern und Bindestrich.")
      return
    }

    setSubmitting(true)
    try {
      const { skill } = await createSkill({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        category,
        method_tags: methodTags,
        project_type_tags: typeTags,
      })
      toast.success(`Skill „${skill.name}" angelegt`)
      onOpenChange(false)
      router.push(`/stammdaten/skills/${skill.id}`)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Anlegen fehlgeschlagen."
      // The API returns a slug-specific 409 message.
      if (/slug/i.test(message)) {
        setSlugError("Dieser Slug ist im Tenant bereits vergeben.")
      } else {
        setError(message)
      }
      toast.error("Skill konnte nicht angelegt werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neuer Skill</DialogTitle>
            <DialogDescription>
              Wiederverwendbare KI-Skill-Definition. Der eigentliche
              Markdown-Inhalt wird danach als erste Version im Detail gepflegt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="skill-name">Name</Label>
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Scrum-Coach"
                maxLength={160}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-slug">Slug</Label>
              <Input
                id="skill-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="z. B. scrum-coach"
                maxLength={80}
                aria-invalid={slugError ? true : undefined}
                aria-describedby="skill-slug-hint"
              />
              <p id="skill-slug-hint" className="text-xs text-muted-foreground">
                Stabiler Bezeichner (Kleinbuchstaben, Ziffern, Bindestrich) —
                unveränderlich nach dem Anlegen.
              </p>
              {slugError && (
                <p className="text-sm text-destructive">{slugError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-description">Beschreibung (optional)</Label>
              <Textarea
                id="skill-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Wofür ist dieser Skill gedacht?"
                maxLength={2000}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-category">Kategorie</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as SkillCategory)}
              >
                <SelectTrigger id="skill-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {SKILL_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SkillTagPicker
              id="skill-method-tags"
              label="Methoden"
              options={METHOD_OPTIONS}
              value={methodTags}
              onChange={setMethodTags}
              disabled={submitting}
            />

            <SkillTagPicker
              id="skill-type-tags"
              label="Projekttypen"
              options={TYPE_OPTIONS}
              value={typeTags}
              onChange={setTypeTags}
              disabled={submitting}
            />

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Anlegen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
