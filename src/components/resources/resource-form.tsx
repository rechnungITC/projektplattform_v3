"use client"

import { AlertCircle, Sparkles } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import type { RoleRate } from "@/types/role-rate"
import {
  RESOURCE_KIND_LABELS,
  RESOURCE_KINDS,
  type Resource,
  type ResourceKind,
} from "@/types/resource"

import {
  TagessatzCombobox,
  type TagessatzComboboxValue,
} from "./tagessatz-combobox"

interface ResourceFormProps {
  initial?: Resource
  submitting: boolean
  onSubmit: (input: ResourceInput) => Promise<void> | void
  onCancel?: () => void
  /**
   * PROJ-54-β — Tenant role_rates catalog used to populate the
   * Tagessatz-Combobox. Pass `useRoleRates(tenantId).rates` from the
   * caller. Empty array hides the role list (combobox still allows
   * inline-override input).
   */
  roleRates?: ReadonlyArray<RoleRate>
  /**
   * PROJ-54-β — When true, the combobox shows the inline-override path
   * (only Tenant-Admins should see this). When false, the combobox is
   * read-only with a hint that an admin must set the rate.
   */
  isTenantAdmin?: boolean
}

export function ResourceForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  roleRates = [],
  isTenantAdmin = false,
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

  // PROJ-54-β — Tagessatz state. Seed from `initial.daily_rate_override`;
  // role-selection in the combobox copies the role's rate into the
  // override (the resource itself doesn't carry role_key — that comes
  // from the linked stakeholder). The user-facing distinction "selected
  // a role" vs "typed own value" is preserved in `tagessatz.role_key`
  // for label rendering only.
  const initialTagessatz = React.useMemo<TagessatzComboboxValue>(() => {
    if (
      initial?.daily_rate_override != null &&
      initial?.daily_rate_override_currency != null
    ) {
      return {
        role_key: null,
        override: {
          daily_rate: initial.daily_rate_override,
          currency: initial.daily_rate_override_currency,
        },
      }
    }
    return { role_key: null, override: null }
  }, [initial])
  const [tagessatz, setTagessatz] =
    React.useState<TagessatzComboboxValue>(initialTagessatz)

  // Translate role-selection into an override on submit (β.1 simplification —
  // role-as-resolution path needs stakeholder linkage UX which lands in β.2).
  const effectiveOverride = React.useMemo(() => {
    if (tagessatz.override) return tagessatz.override
    if (tagessatz.role_key) {
      const today = new Date().toISOString().slice(0, 10)
      const r = roleRates
        .filter((x) => x.role_key === tagessatz.role_key && x.valid_from <= today)
        .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
      if (r) return { daily_rate: r.daily_rate, currency: r.currency as string }
    }
    return null
  }, [tagessatz, roleRates])

  const showBestandBanner =
    initial != null &&
    initial.daily_rate_override == null &&
    !tagessatz.override &&
    !tagessatz.role_key

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
    // PROJ-54-β — when the admin set/changed the Tagessatz, persist it
    // as an override. When the admin (or non-admin) leaves it untouched,
    // we send neither field so the API doesn't trigger the admin-gate.
    const tagessatzPatch: Pick<
      ResourceInput,
      "daily_rate_override" | "daily_rate_override_currency"
    > = {}
    const initialHadOverride = initial?.daily_rate_override != null
    const wantsOverride = effectiveOverride != null
    if (wantsOverride) {
      tagessatzPatch.daily_rate_override = effectiveOverride.daily_rate
      tagessatzPatch.daily_rate_override_currency = effectiveOverride.currency
    } else if (initialHadOverride) {
      // Admin cleared the field — explicit nulls clear the DB row.
      tagessatzPatch.daily_rate_override = null
      tagessatzPatch.daily_rate_override_currency = null
    }
    setError(null)
    await onSubmit({
      display_name: displayName.trim(),
      kind,
      fte_default: fteNum,
      availability_default: availNum,
      is_active: isActive,
      ...tagessatzPatch,
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

      <div className="space-y-2">
        <Label htmlFor="tagessatz">
          Tagessatz{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {isTenantAdmin
              ? "(aus Rollen-Katalog wählen oder eigenen Betrag eintippen)"
              : "(setzt der Tenant-Admin in den Stammdaten)"}
          </span>
        </Label>
        {showBestandBanner ? (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle className="text-sm">Tagessatz fehlt</AlertTitle>
            <AlertDescription className="text-xs">
              Diese Resource hat keinen aufgelösten Tagessatz. Setze einen
              eigenen Satz oder verknüpfe einen Stakeholder mit Rolle, bevor
              weitere Allocations entstehen.
            </AlertDescription>
          </Alert>
        ) : null}
        <TagessatzCombobox
          roleRates={roleRates}
          value={tagessatz}
          onChange={setTagessatz}
          rolesOnly={!isTenantAdmin}
          disabled={!isTenantAdmin && tagessatz.override != null}
        />
        {tagessatz.role_key && tagessatz.override == null ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" aria-hidden />
            Beim Speichern wird der Rollen-Tagessatz als eigener Override
            übernommen (Resource speichert keinen role_key direkt).
          </p>
        ) : null}
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
