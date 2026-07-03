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
import {
  createRiskCategory,
  updateRiskCategory,
} from "@/lib/risk-categories/api"
import type { RiskCategory } from "@/types/risk"

interface Props {
  open: boolean
  mode: "create" | "edit"
  initial: RiskCategory | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const KEY_RE = /^[a-z0-9_]+$/

export function RiskCategoryFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: Props) {
  const [key, setKey] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [appliesTo, setAppliesTo] = React.useState("")
  const [sortOrder, setSortOrder] = React.useState("0")
  const [isActive, setIsActive] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot form reset when the dialog opens
    setError(null)
    if (mode === "edit" && initial) {
      setKey(initial.key)
      setLabel(initial.label)
      setAppliesTo(initial.applies_to_project_type ?? "")
      setSortOrder(String(initial.sort_order))
      setIsActive(initial.is_active)
    } else {
      setKey("")
      setLabel("")
      setAppliesTo("")
      setSortOrder("0")
      setIsActive(true)
    }
  }, [open, mode, initial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!KEY_RE.test(key.trim())) {
      setError("Schlüssel: nur Kleinbuchstaben, Ziffern und Unterstrich.")
      return
    }
    if (!label.trim()) {
      setError("Label ist erforderlich.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        key: key.trim(),
        label: label.trim(),
        applies_to_project_type: appliesTo.trim() || null,
        sort_order: Number(sortOrder) || 0,
      }
      if (mode === "edit" && initial) {
        await updateRiskCategory(initial.id, { ...payload, is_active: isActive })
      } else {
        await createRiskCategory(payload)
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
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "edit"
                ? "Kategorie bearbeiten"
                : "Neue Risikokategorie"}
            </DialogTitle>
            <DialogDescription>
              Kategorien strukturieren das Risikoregister und liefern die
              gruppierbare Achse fürs Reporting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cat-key">Schlüssel</Label>
              <Input
                id="cat-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="z. B. financial"
                maxLength={64}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Stabiler Schlüssel (Kleinbuchstaben/Ziffern/Unterstrich) — dient
                als Reporting-Achse.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-label">Label</Label>
              <Input
                id="cat-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="z. B. Financial"
                maxLength={120}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat-applies">Projekttyp (optional)</Label>
                <Input
                  id="cat-applies"
                  value={appliesTo}
                  onChange={(e) => setAppliesTo(e.target.value)}
                  placeholder="leer = alle"
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cat-sort">Sortierung</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  min={0}
                  max={9999}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
            </div>

            {mode === "edit" && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label htmlFor="cat-active">Aktiv</Label>
                  <p className="text-xs text-muted-foreground">
                    Inaktive Kategorien erscheinen nicht mehr im Auswahl-Dropdown
                    (bestehende Zuordnungen bleiben).
                  </p>
                </div>
                <Switch
                  id="cat-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            )}

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
              {mode === "edit" ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
