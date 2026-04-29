"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { ResourceInput } from "@/lib/resources/api"
import {
  RESOURCE_KIND_LABELS,
  RESOURCE_KINDS,
  type Resource,
  type ResourceKind,
} from "@/types/resource"

interface ResourceFormProps {
  initial?: Resource
  submitting: boolean
  onSubmit: (input: ResourceInput) => Promise<void> | void
  onCancel?: () => void
}

export function ResourceForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: ResourceFormProps) {
  const [displayName, setDisplayName] = React.useState(initial?.display_name ?? "")
  const [kind, setKind] = React.useState<ResourceKind>(
    (initial?.kind ?? "internal") as ResourceKind
  )
  const [fte, setFte] = React.useState<string>(
    String(initial?.fte_default ?? 1)
  )
  const [availability, setAvailability] = React.useState<string>(
    String(initial?.availability_default ?? 1)
  )
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? true)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (displayName.trim().length === 0) {
      setError("Name ist erforderlich.")
      return
    }
    const fteNum = Number.parseFloat(fte)
    const availNum = Number.parseFloat(availability)
    if (!Number.isFinite(fteNum) || fteNum < 0 || fteNum > 1) {
      setError("FTE muss zwischen 0 und 1 liegen (z. B. 0.8 für 80%).")
      return
    }
    if (!Number.isFinite(availNum) || availNum < 0 || availNum > 1) {
      setError("Verfügbarkeit muss zwischen 0 und 1 liegen.")
      return
    }
    setError(null)
    await onSubmit({
      display_name: displayName.trim(),
      kind,
      fte_default: fteNum,
      availability_default: availNum,
      is_active: isActive,
    })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="display_name">Name</Label>
        <Input
          id="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="kind">Art</Label>
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as ResourceKind)}
        >
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {RESOURCE_KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="fte">
            FTE{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (0.0 – 1.0)
            </span>
          </Label>
          <Input
            id="fte"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={fte}
            onChange={(e) => setFte(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="availability">
            Verfügbarkeit{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (0.0 – 1.0)
            </span>
          </Label>
          <Input
            id="availability"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label htmlFor="is_active">Aktiv</Label>
          <p className="text-xs text-muted-foreground">
            Inaktive Ressourcen erscheinen nicht im Auslastungs-Bericht.
          </p>
        </div>
        <Switch
          id="is_active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Speichere …"
            : initial
              ? "Speichern"
              : "Anlegen"}
        </Button>
      </div>
    </form>
  )
}
