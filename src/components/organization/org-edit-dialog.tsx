"use client"

/**
 * PROJ-62 — Create / edit dialog for organization_units.
 *
 * Used in both the Tree-View (inline "neue Untereinheit") and the
 * Tabelle-Tab. Validates name + type client-side; the server enforces
 * cycle-prevention, same-tenant-parent, and optimistic-locks.
 */

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { collectDescendants } from "@/lib/organization/tree-walk"
import {
  ORGANIZATION_UNIT_TYPES,
  ORGANIZATION_UNIT_TYPE_LABELS,
  type Location,
  type OrganizationUnit,
  type OrganizationUnitType,
} from "@/types/organization"

import { LocationSelect } from "./location-select"
import { OrgUnitCombobox } from "./org-unit-combobox"

interface OrgEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, dialog is in edit-mode for this unit. */
  editing: OrganizationUnit | null
  /** Pre-filled parent for create-mode (e.g. clicked "+ Untereinheit" on a node). */
  defaultParentId?: string | null
  /** Pre-filled type for create-mode. */
  defaultType?: OrganizationUnitType
  /** Full unit list for excludeIds + descendant-blocking in the parent picker. */
  allUnits: OrganizationUnit[]
  locations: Location[]
  onCreate: (body: {
    name: string
    type: OrganizationUnitType
    parent_id: string | null
    location_id: string | null
    code: string | null
    description: string | null
    sort_order: number | null
  }) => Promise<void>
  onUpdate: (
    id: string,
    body: {
      expected_updated_at: string
      name?: string
      type?: OrganizationUnitType
      parent_id?: string | null
      location_id?: string | null
      code?: string | null
      description?: string | null
      sort_order?: number | null
    },
  ) => Promise<void>
}

interface FormState {
  name: string
  type: OrganizationUnitType
  parent_id: string | null
  location_id: string | null
  code: string
  description: string
  sort_order: string
}

function emptyForm(
  defaults: { type?: OrganizationUnitType; parent_id?: string | null } = {},
): FormState {
  return {
    name: "",
    type: defaults.type ?? "department",
    parent_id: defaults.parent_id ?? null,
    location_id: null,
    code: "",
    description: "",
    sort_order: "",
  }
}

function fromUnit(u: OrganizationUnit): FormState {
  return {
    name: u.name,
    type: u.type,
    parent_id: u.parent_id,
    location_id: u.location_id,
    code: u.code ?? "",
    description: u.description ?? "",
    sort_order: u.sort_order != null ? String(u.sort_order) : "",
  }
}

export function OrgEditDialog({
  open,
  onOpenChange,
  editing,
  defaultParentId,
  defaultType,
  allUnits,
  locations,
  onCreate,
  onUpdate,
}: OrgEditDialogProps) {
  const isEdit = editing !== null
  const [form, setForm] = React.useState<FormState>(() => emptyForm())
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setForm(fromUnit(editing))
    } else {
      setForm(
        emptyForm({
          parent_id: defaultParentId ?? null,
          type: defaultType,
        }),
      )
    }
    setErrors({})
  }, [open, editing, defaultParentId, defaultType])

  const excludeIds = React.useMemo(() => {
    if (!editing) return []
    const desc = collectDescendants(editing.id, allUnits).map((u) => u.id)
    return [editing.id, ...desc]
  }, [editing, allUnits])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key as string]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key as string]
        return next
      })
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    const trimmedName = form.name.trim()
    if (!trimmedName) next.name = "Name ist Pflicht."
    if (trimmedName.length > 200) next.name = "Maximal 200 Zeichen."
    if (form.code.trim().length > 50) next.code = "Maximal 50 Zeichen."
    if (form.sort_order.trim()) {
      const parsed = Number.parseInt(form.sort_order, 10)
      if (Number.isNaN(parsed)) {
        next.sort_order = "Muss eine Zahl sein."
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        parent_id: form.parent_id,
        location_id: form.location_id,
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        sort_order: form.sort_order.trim()
          ? Number.parseInt(form.sort_order, 10)
          : null,
      }
      if (isEdit && editing) {
        await onUpdate(editing.id, {
          expected_updated_at: editing.updated_at,
          ...payload,
        })
        toast.success("Einheit aktualisiert.")
      } else {
        await onCreate(payload)
        toast.success("Einheit angelegt.")
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Organisationseinheit bearbeiten" : "Neue Einheit anlegen"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Änderungen werden mit Optimistic-Lock gegen den letzten gelesenen Stand abgeglichen."
              : "Lege eine neue Organisationseinheit an. Pflichtfelder sind Name und Typ."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="org-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="org-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="z.B. CRM Team"
              maxLength={200}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name}</p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="org-type">
              Typ <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.type}
              onValueChange={(v) => update("type", v as OrganizationUnitType)}
            >
              <SelectTrigger id="org-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_UNIT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ORGANIZATION_UNIT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Übergeordnete Einheit</Label>
            <OrgUnitCombobox
              value={form.parent_id}
              onChange={(v) => update("parent_id", v)}
              excludeIds={excludeIds}
              placeholder="Keine — Wurzel-Einheit"
              selectedFallbackLabel={
                editing && form.parent_id ? "Bestehender Parent" : undefined
              }
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Standort</Label>
            <LocationSelect
              value={form.location_id}
              onChange={(v) => update("location_id", v)}
              locations={locations}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="org-code">Code</Label>
            <Input
              id="org-code"
              value={form.code}
              onChange={(e) => update("code", e.target.value)}
              placeholder="optional, z.B. IT-CRM"
              maxLength={50}
              aria-invalid={Boolean(errors.code)}
            />
            {errors.code ? (
              <p className="text-xs text-destructive">{errors.code}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Eindeutig pro Tenant — wird beim CSV-Import als Schlüssel genutzt.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="org-description">Beschreibung</Label>
            <Textarea
              id="org-description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="optional"
              rows={3}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="org-sort-order">Sortier-Order</Label>
            <Input
              id="org-sort-order"
              value={form.sort_order}
              onChange={(e) => update("sort_order", e.target.value)}
              placeholder="optional, Ganzzahl"
              inputMode="numeric"
              aria-invalid={Boolean(errors.sort_order)}
            />
            {errors.sort_order ? (
              <p className="text-xs text-destructive">{errors.sort_order}</p>
            ) : null}
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
