"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { HexColorPicker } from "react-colorful"
import { toast } from "sonner"

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  createStakeholderType,
  updateStakeholderType,
} from "@/lib/stakeholder-types/api"
import type { StakeholderType } from "@/types/stakeholder-type"

interface Props {
  open: boolean
  mode: "create" | "edit"
  initial: StakeholderType | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function StakeholderTypeFormDialog({
  open,
  mode,
  initial,
  onOpenChange,
  onSaved,
}: Props) {
  const [keyValue, setKeyValue] = React.useState("")
  const [labelDe, setLabelDe] = React.useState("")
  const [labelEn, setLabelEn] = React.useState("")
  const [color, setColor] = React.useState("#3b82f6")
  const [displayOrder, setDisplayOrder] = React.useState<number>(100)
  const [isActive, setIsActive] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset on open / initial change.
  React.useEffect(() => {
    if (open) {
      setError(null)
      if (mode === "edit" && initial) {
        setKeyValue(initial.key)
        setLabelDe(initial.label_de)
        setLabelEn(initial.label_en ?? "")
        setColor(initial.color)
        setDisplayOrder(initial.display_order)
        setIsActive(initial.is_active)
      } else {
        setKeyValue("")
        setLabelDe("")
        setLabelEn("")
        setColor("#3b82f6")
        setDisplayOrder(100)
        setIsActive(true)
      }
    }
  }, [open, mode, initial])

  const keyValid =
    mode === "edit" || /^[a-z][a-z0-9_-]{0,63}$/.test(keyValue.trim())
  const labelValid = labelDe.trim().length > 0 && labelDe.trim().length <= 100
  const colorValid = HEX_RE.test(color)
  const canSubmit = keyValid && labelValid && colorValid && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      if (mode === "edit" && initial) {
        await updateStakeholderType(initial.id, {
          label_de: labelDe.trim(),
          label_en: labelEn.trim() || null,
          color,
          display_order: displayOrder,
          is_active: isActive,
        })
        toast.success(`„${labelDe}" aktualisiert`)
      } else {
        await createStakeholderType({
          key: keyValue.trim().toLowerCase(),
          label_de: labelDe.trim(),
          label_en: labelEn.trim() || null,
          color,
          display_order: displayOrder,
          is_active: isActive,
        })
        toast.success(`„${labelDe}" angelegt`)
      }
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler"
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Neuer Stakeholder-Typ" : "Typ bearbeiten"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Eigene Typen sind tenant-weit verfügbar und können später deaktiviert werden."
              : "Globale Defaults sind nicht editierbar — du editierst hier deinen tenant-eigenen Eintrag."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type-key">Key *</Label>
            <Input
              id="type-key"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="z. B. champion oder fence-sitter"
              disabled={submitting || mode === "edit"}
              maxLength={64}
            />
            {mode === "create" && (
              <p className="text-xs text-muted-foreground">
                lower-case, ascii-letters/digits/-/_ — nicht änderbar nach
                Erstellung. Darf nicht mit globalen Defaults kollidieren
                (promoter/supporter/critic/blocker).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type-label-de">Label (DE) *</Label>
            <Input
              id="type-label-de"
              value={labelDe}
              onChange={(e) => setLabelDe(e.target.value)}
              maxLength={100}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type-label-en">Label (EN, optional)</Label>
            <Input
              id="type-label-en"
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
              maxLength={100}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Farbe *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={submitting}
                >
                  <span
                    className="mr-2 inline-block h-4 w-4 rounded-full border"
                    style={{ backgroundColor: colorValid ? color : "transparent" }}
                  />
                  <span className="font-mono text-xs">{color}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3">
                <div className="space-y-3">
                  <HexColorPicker color={color} onChange={setColor} />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="font-mono text-xs"
                    maxLength={7}
                  />
                </div>
              </PopoverContent>
            </Popover>
            {!colorValid && (
              <p className="text-xs text-destructive">
                Hex-Format erforderlich (#rrggbb).
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type-display-order">Reihenfolge</Label>
              <Input
                id="type-display-order"
                type="number"
                min={0}
                max={10000}
                value={displayOrder}
                onChange={(e) =>
                  setDisplayOrder(Number.parseInt(e.target.value, 10) || 0)
                }
                disabled={submitting}
              />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <Checkbox
                id="type-is-active"
                checked={isActive}
                onCheckedChange={(c) => setIsActive(c === true)}
                disabled={submitting}
              />
              <Label htmlFor="type-is-active" className="cursor-pointer">
                Aktiv
              </Label>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
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
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Speichern …
              </>
            ) : (
              "Speichern"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
