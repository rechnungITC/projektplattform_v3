"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"

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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  createDdStreamTemplate,
  type DdStreamTemplate,
  updateDdStreamTemplate,
} from "@/lib/ma-project/dd-streams-api"

interface Props {
  open: boolean
  mode: "create" | "edit"
  initial: DdStreamTemplate | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

// PROJ-112 — create/edit a DD-stream template (tenant catalog). stream_key is
// immutable after creation (it keys the per-project activation); only
// label/description/sort/active are editable on edit.
export function DdStreamTemplateFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: Props) {
  const [streamKey, setStreamKey] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [sortOrder, setSortOrder] = React.useState(0)
  const [isActive, setIsActive] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form reset when the dialog opens
    setError(null)
    if (mode === "edit" && initial) {
      setStreamKey(initial.stream_key)
      setLabel(initial.label)
      setDescription(initial.description ?? "")
      setSortOrder(initial.sort_order)
      setIsActive(initial.is_active)
    } else {
      setStreamKey("")
      setLabel("")
      setDescription("")
      setSortOrder(0)
      setIsActive(true)
    }
  }, [open, mode, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === "create" && !/^[a-z][a-z0-9_]{1,40}$/.test(streamKey)) {
      setError("Schlüssel: Kleinbuchstaben a-z, 0-9, _ (2-41 Zeichen).")
      return
    }
    if (!label.trim()) {
      setError("Label ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (mode === "edit" && initial) {
        await updateDdStreamTemplate(initial.id, {
          label: label.trim(),
          description: description.trim() || null,
          sort_order: sortOrder,
          is_active: isActive,
        })
      } else {
        await createDdStreamTemplate({
          stream_key: streamKey,
          label: label.trim(),
          description: description.trim() || null,
          sort_order: sortOrder,
          is_active: isActive,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Vorlage bearbeiten" : "Neue DD-Stream-Vorlage"}
            </DialogTitle>
            <DialogDescription>
              Vorlagen werden beim Aktivieren in ein Projekt kopiert
              (Copy-on-create). Änderungen wirken nur auf neu aktivierte Streams.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-key">Schlüssel</Label>
              <Input
                id="tpl-key"
                value={streamKey}
                onChange={(e) => setStreamKey(e.target.value)}
                placeholder="z. B. esg"
                disabled={mode === "edit"}
                maxLength={41}
              />
              {mode === "edit" && (
                <p className="text-xs text-muted-foreground">
                  Der Schlüssel ist nach dem Anlegen fest.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-label">Label</Label>
              <Input
                id="tpl-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. ESG"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Beschreibung (optional)</Label>
              <Textarea
                id="tpl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="tpl-sort">Sortierung</Label>
                <Input
                  id="tpl-sort"
                  type="number"
                  min={0}
                  max={9999}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                  className="w-24"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="tpl-active" checked={isActive} onCheckedChange={setIsActive} />
                <Label htmlFor="tpl-active">Aktiv</Label>
              </div>
            </div>

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
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              {mode === "edit" ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}