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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { BudgetItemInput } from "@/lib/budget/api"
import type { BudgetCategory, BudgetItem } from "@/types/budget"
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"

interface BudgetItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: readonly BudgetCategory[]
  initial?: BudgetItem
  defaultCategoryId?: string
  defaultCurrency: SupportedCurrency
  onSubmit: (input: BudgetItemInput) => Promise<unknown>
}

export function BudgetItemDialog({
  open,
  onOpenChange,
  categories,
  initial,
  defaultCategoryId,
  defaultCurrency,
  onSubmit,
}: BudgetItemDialogProps) {
  const [categoryId, setCategoryId] = React.useState<string>("")
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [plannedAmount, setPlannedAmount] = React.useState("0")
  const [currency, setCurrency] = React.useState<SupportedCurrency>(defaultCurrency)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setCategoryId(initial?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "")
    setName(initial?.name ?? "")
    setDescription(initial?.description ?? "")
    setPlannedAmount(initial ? String(initial.planned_amount) : "0")
    setCurrency((initial?.planned_currency as SupportedCurrency) ?? defaultCurrency)
  }, [open, initial, defaultCategoryId, defaultCurrency, categories])

  async function handleSubmit() {
    if (!categoryId) {
      toast.error("Kategorie wählen.")
      return
    }
    if (!name.trim()) {
      toast.error("Name ist erforderlich.")
      return
    }
    const amount = Number(plannedAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Plan-Betrag muss eine nicht-negative Zahl sein.")
      return
    }

    try {
      setBusy(true)
      await onSubmit({
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        planned_amount: amount,
        planned_currency: currency,
      })
      onOpenChange(false)
      toast.success(initial ? "Posten aktualisiert." : "Posten angelegt.")
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
            {initial ? "Posten bearbeiten" : "Posten anlegen"}
          </DialogTitle>
          <DialogDescription>
            Plan-Wert + Währung. Ist-Wert wird aus den Buchungen aggregiert.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="item-cat">Kategorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="item-cat">
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="item-planned">Plan-Betrag</Label>
              <Input
                id="item-planned"
                type="number"
                step="0.01"
                min="0"
                value={plannedAmount}
                onChange={(e) => setPlannedAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-currency">Währung</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as SupportedCurrency)}
              >
                <SelectTrigger id="item-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-description">Beschreibung (optional)</Label>
            <Textarea
              id="item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
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
