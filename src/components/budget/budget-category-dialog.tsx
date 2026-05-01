"use client"

import * as React from "react"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"
import type { BudgetCategoryInput } from "@/lib/budget/api"
import type { BudgetCategory } from "@/types/budget"

interface BudgetCategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: BudgetCategory
  onSubmit: (input: BudgetCategoryInput) => Promise<unknown>
}

export function BudgetCategoryDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: BudgetCategoryDialogProps) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "")
      setDescription(initial?.description ?? "")
    }
  }, [open, initial])

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name ist erforderlich.")
      return
    }
    try {
      setBusy(true)
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
      })
      onOpenChange(false)
      toast.success(initial ? "Kategorie aktualisiert." : "Kategorie angelegt.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Kategorie bearbeiten" : "Kategorie anlegen"}
          </DialogTitle>
          <DialogDescription>
            Top-Level-Gruppe für Budget-Posten (z.B. „Personalkosten&ldquo;,
            „Lizenzen&ldquo;).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat-description">Beschreibung (optional)</Label>
            <Textarea
              id="cat-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {busy ? "Speichert …" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
