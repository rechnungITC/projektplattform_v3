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
  createConstructionTrade,
  updateConstructionTrade,
} from "@/lib/construction/api"
import type { ConstructionTrade } from "@/types/construction"

interface Props {
  open: boolean
  /** null = create, otherwise edit. */
  trade: ConstructionTrade | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void | Promise<void>
}

/** Derives a stable lower_snake_case key from a label, matching the DB CHECK. */
function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
}

export function ConstructionTradeFormDialog({
  open,
  trade,
  onOpenChange,
  onSaved,
}: Props) {
  const isEdit = trade !== null
  const [label, setLabel] = React.useState("")
  const [key, setKey] = React.useState("")
  const [keyTouched, setKeyTouched] = React.useState(false)
  const [sortOrder, setSortOrder] = React.useState("0")
  const [saving, setSaving] = React.useState(false)

  // Keyed remount instead of syncing state in an effect (house rule: no
  // set-state-in-effect). The parent passes a fresh dialog per target row.
  React.useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot seed when the dialog opens
    setLabel(trade?.label ?? "")
    setKey(trade?.key ?? "")
    setKeyTouched(false)
    setSortOrder(String(trade?.sort_order ?? 0))
  }, [open, trade])

  const effectiveKey = keyTouched || isEdit ? key : slugifyKey(label)
  const keyValid = /^[a-z0-9_]+$/.test(effectiveKey)
  const canSave = label.trim().length > 0 && (isEdit || keyValid) && !saving

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      const parsedOrder = Number.parseInt(sortOrder, 10)
      const sort_order = Number.isFinite(parsedOrder) ? parsedOrder : 0

      if (isEdit) {
        await updateConstructionTrade(trade.id, { label: label.trim(), sort_order })
        toast.success("Gewerk gespeichert", {
          description: "Die neue Bezeichnung gilt ab sofort in allen Projekten.",
        })
      } else {
        await createConstructionTrade({
          key: effectiveKey,
          label: label.trim(),
          sort_order,
        })
        toast.success("Gewerk angelegt")
      }
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Gewerk bearbeiten" : "Gewerk anlegen"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Die Bezeichnung wirkt sofort in allen Projekten, die dieses Gewerk verwenden — sie verweisen darauf, statt eine Kopie zu führen."
                : "Die Kennung bleibt dauerhaft und identifiziert das Gewerk; die Bezeichnung lässt sich später jederzeit ändern."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="trade-label">Bezeichnung</Label>
              <Input
                id="trade-label"
                value={label}
                maxLength={120}
                autoFocus
                placeholder="z. B. Elektrotechnik"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="trade-key">Kennung</Label>
              <Input
                id="trade-key"
                value={effectiveKey}
                maxLength={64}
                disabled={isEdit}
                placeholder="elektrotechnik"
                onChange={(e) => {
                  setKeyTouched(true)
                  setKey(e.target.value)
                }}
              />
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? "Die Kennung ist die dauerhafte Identität des Gewerks und lässt sich nicht ändern."
                  : "Wird aus der Bezeichnung vorgeschlagen. Nur Kleinbuchstaben, Ziffern und Unterstriche."}
              </p>
              {!isEdit && effectiveKey.length > 0 && !keyValid ? (
                <p className="text-xs text-destructive">
                  Nur Kleinbuchstaben, Ziffern und Unterstriche erlaubt.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="trade-sort">Reihenfolge</Label>
              <Input
                id="trade-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Bestimmt die Sortierung in der Auswahl. Kleinere Zahlen zuerst.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving ? "Speichern …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
