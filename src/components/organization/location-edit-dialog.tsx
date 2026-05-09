"use client"

import { Loader2 } from "lucide-react"
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
import type {
  CreateLocationRequest,
  Location,
  PatchLocationRequest,
} from "@/types/organization"

interface LocationEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Location | null
  onCreate: (body: CreateLocationRequest) => Promise<void>
  onUpdate: (id: string, body: PatchLocationRequest) => Promise<void>
}

interface FormState {
  name: string
  country: string
  city: string
  address: string
}

export function LocationEditDialog({
  open,
  onOpenChange,
  editing,
  onCreate,
  onUpdate,
}: LocationEditDialogProps) {
  const isEdit = editing !== null
  const [form, setForm] = React.useState<FormState>({
    name: "",
    country: "",
    city: "",
    address: "",
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setNameError(null)
    setForm(
      editing
        ? {
            name: editing.name,
            country: editing.country ?? "",
            city: editing.city ?? "",
            address: editing.address ?? "",
          }
        : { name: "", country: "", city: "", address: "" },
    )
  }, [open, editing])

  async function handleSubmit() {
    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setNameError("Name ist Pflicht.")
      return
    }
    setSubmitting(true)
    try {
      if (isEdit && editing) {
        await onUpdate(editing.id, {
          expected_updated_at: editing.updated_at,
          name: trimmedName,
          country: form.country.trim() || null,
          city: form.city.trim() || null,
          address: form.address.trim() || null,
        })
        toast.success("Standort aktualisiert.")
      } else {
        await onCreate({
          name: trimmedName,
          country: form.country.trim() || null,
          city: form.city.trim() || null,
          address: form.address.trim() || null,
        })
        toast.success("Standort angelegt.")
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Speichern fehlgeschlagen.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Standort bearbeiten" : "Neuer Standort"}
          </DialogTitle>
          <DialogDescription>
            Standorte können in Organisationseinheiten als Standort-FK
            verwendet werden.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="loc-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="loc-name"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }))
                if (nameError) setNameError(null)
              }}
              placeholder="z.B. HQ Hamburg"
              maxLength={120}
              aria-invalid={Boolean(nameError)}
            />
            {nameError ? (
              <p className="text-xs text-destructive">{nameError}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="loc-country">Land</Label>
            <Input
              id="loc-country"
              value={form.country}
              onChange={(e) =>
                setForm((f) => ({ ...f, country: e.target.value }))
              }
              placeholder="z.B. Deutschland"
              maxLength={80}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="loc-city">Stadt</Label>
            <Input
              id="loc-city"
              value={form.city}
              onChange={(e) =>
                setForm((f) => ({ ...f, city: e.target.value }))
              }
              placeholder="z.B. Hamburg"
              maxLength={80}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="loc-address">Adresse</Label>
            <Input
              id="loc-address"
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
              placeholder="optional"
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {isEdit ? "Speichern" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
