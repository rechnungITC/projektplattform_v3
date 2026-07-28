"use client"

/**
 * PROJ-77-β — admin-only CRUD section for a skill's reusable input/output
 * example pairs. Authoring aid (not PM-facing in V1); the `examples` endpoint
 * 403s non-admins, so callers pass `canEdit={isAdmin}` and we render nothing
 * when it is false.
 */

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  createSkillExample,
  deleteSkillExample,
  listSkillExamples,
  updateSkillExample,
  type SkillExampleInput,
} from "@/lib/skills/api"
import type { SkillExample } from "@/types/skill"

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unbekannter Fehler"
}

/** Split a comma-separated string into a de-duplicated, trimmed tag list. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(",")) {
    const t = part.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

function sortExamples(list: SkillExample[]): SkillExample[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.display_order - b.display_order ||
        a.created_at.localeCompare(b.created_at)
    )
}

interface Props {
  skillId: string
  canEdit: boolean
}

export function SkillExamplesSection({ skillId, canEdit }: Props) {
  const [examples, setExamples] = React.useState<SkillExample[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadTick, setReloadTick] = React.useState(0)

  // add/edit dialog state (null editing = "add" mode)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SkillExample | null>(null)
  const [title, setTitle] = React.useState("")
  const [inputText, setInputText] = React.useState("")
  const [expectedOutput, setExpectedOutput] = React.useState("")
  const [tagsText, setTagsText] = React.useState("")
  const [displayOrder, setDisplayOrder] = React.useState("0")
  const [saving, setSaving] = React.useState(false)

  // delete confirm state
  const [deleteTarget, setDeleteTarget] = React.useState<SkillExample | null>(
    null
  )
  const [deleting, setDeleting] = React.useState(false)

  React.useEffect(() => {
    if (!canEdit) return
    let cancelled = false
    listSkillExamples(skillId)
      .then((rows) => {
        if (cancelled) return
        setError(null)
        setExamples(sortExamples(rows))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(errMsg(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [skillId, canEdit, reloadTick])

  const refresh = React.useCallback(() => {
    setLoading(true)
    setReloadTick((t) => t + 1)
  }, [])

  const openAdd = React.useCallback(() => {
    setEditing(null)
    setTitle("")
    setInputText("")
    setExpectedOutput("")
    setTagsText("")
    setDisplayOrder("0")
    setDialogOpen(true)
  }, [])

  const openEdit = React.useCallback((ex: SkillExample) => {
    setEditing(ex)
    setTitle(ex.title)
    setInputText(ex.input)
    setExpectedOutput(ex.expected_output)
    setTagsText(ex.tags.join(", "))
    setDisplayOrder(String(ex.display_order))
    setDialogOpen(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    const inp = inputText.trim()
    const out = expectedOutput.trim()
    if (!t) {
      toast.error("Titel ist erforderlich.")
      return
    }
    if (!inp) {
      toast.error("Eingabe ist erforderlich.")
      return
    }
    if (!out) {
      toast.error("Erwartete Ausgabe ist erforderlich.")
      return
    }
    const orderNum = Number(displayOrder)
    const payload: SkillExampleInput = {
      title: t,
      input: inp,
      expected_output: out,
      tags: parseTags(tagsText),
      display_order: Number.isFinite(orderNum) ? orderNum : 0,
    }
    setSaving(true)
    try {
      if (editing) {
        await updateSkillExample(skillId, editing.id, payload)
        toast.success("Beispiel aktualisiert")
      } else {
        await createSkillExample(skillId, payload)
        toast.success("Beispiel hinzugefügt")
      }
      setDialogOpen(false)
      refresh()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", { description: errMsg(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSkillExample(skillId, deleteTarget.id)
      toast.success("Beispiel gelöscht")
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", { description: errMsg(err) })
    } finally {
      setDeleting(false)
    }
  }

  // Examples are an admin-only authoring aid; render nothing for non-admins.
  if (!canEdit) return null

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">Beispiele</CardTitle>
          <p className="text-xs text-muted-foreground">
            Wiederverwendbare Eingabe-/Ausgabe-Paare als Autoren-Hilfe. Nur für
            Administratoren sichtbar.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Beispiel hinzufügen
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 py-8 text-center text-sm text-destructive">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={refresh}
            >
              Erneut versuchen
            </Button>
          </div>
        ) : examples.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Beispiele.
          </p>
        ) : (
          <ul className="space-y-3">
            {examples.map((ex) => (
              <li
                key={ex.id}
                className="rounded-md border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{ex.title}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        #{ex.display_order}
                      </Badge>
                    </div>
                    {ex.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ex.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label={`Beispiel „${ex.title}“ bearbeiten`}
                      onClick={() => openEdit(ex)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Beispiel „${ex.title}“ löschen`}
                      onClick={() => setDeleteTarget(ex)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Eingabe
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-words">
                      {ex.input}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Erwartete Ausgabe
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-words">
                      {ex.expected_output}
                    </pre>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Beispiel bearbeiten" : "Beispiel hinzufügen"}
              </DialogTitle>
              <DialogDescription>
                Ein Eingabe-/Ausgabe-Paar als Referenz für dieses Skill.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="ex-title">Titel</Label>
              <Input
                id="ex-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Kurzer, sprechender Name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ex-input">Eingabe</Label>
              <Textarea
                id="ex-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={5}
                className="font-mono text-xs"
                placeholder="Beispielhafte Eingabe …"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ex-output">Erwartete Ausgabe</Label>
              <Textarea
                id="ex-output"
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                rows={5}
                className="font-mono text-xs"
                placeholder="Erwartete Ausgabe zu dieser Eingabe …"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ex-tags">Tags (optional)</Label>
                <Input
                  id="ex-tags"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Komma-getrennt, z. B. edge-case, happy-path"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex-order">Reihenfolge</Label>
                <Input
                  id="ex-order"
                  type="number"
                  step={1}
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                {editing ? "Speichern" : "Hinzufügen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Beispiel löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `„${deleteTarget.title}“ wird dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
                : "Dieses Beispiel wird dauerhaft entfernt."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
