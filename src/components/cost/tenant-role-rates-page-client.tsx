"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useAuth } from "@/hooks/use-auth"
import { useRoleRates } from "@/hooks/use-role-rates"
import type { RoleRate, RoleRateInput } from "@/types/role-rate"
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"

export function TenantRoleRatesPageClient() {
  const { currentTenant, currentRole } = useAuth()
  const isAdmin = currentRole === "admin"
  const tenantId = currentTenant?.id ?? null

  if (!tenantId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tagessätze</CardTitle>
          <CardDescription>Kein aktiver Tenant ausgewählt.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tagessätze</CardTitle>
          <CardDescription>
            Nur Tenant-Admins können Tagessätze pflegen.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return <RoleRatesAdmin tenantId={tenantId} />
}

function RoleRatesAdmin({ tenantId }: { tenantId: string }) {
  const { rates, loading, error, create, remove } = useRoleRates(tenantId)
  const [createOpen, setCreateOpen] = React.useState(false)

  const grouped = React.useMemo(() => groupByRole(rates), [rates])
  const todayKey = React.useMemo(() => new Date().toISOString().slice(0, 10), [])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tagessätze</h1>
          <p className="text-sm text-muted-foreground">
            Versionierte Tagessätze pro Rolle. Eine Erhöhung wird als neuer
            Datensatz mit eigenem Gültigkeits-Datum angelegt — alte Werte
            bleiben für die Cost-Historie erhalten.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Tagessatz hinzufügen
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : rates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Noch keine Tagessätze gepflegt.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ roleKey, items }) => (
            <Card key={roleKey}>
              <CardHeader className="flex-row items-baseline justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="font-mono text-base">{roleKey}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {items.length} Eintrag{items.length === 1 ? "" : "e"}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-t bg-muted/30">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">
                        Gültig ab
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="px-3 py-2 text-left font-medium">
                        Währung
                      </th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r, idx) => {
                      const isCurrent = idx === 0 && r.valid_from <= todayKey
                      const isFuture = r.valid_from > todayKey
                      return (
                        <tr key={r.id} className="border-t last:border-b-0">
                          <td className="px-3 py-2 tabular-nums">
                            {r.valid_from}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatRate(r.daily_rate)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.currency}
                          </td>
                          <td className="px-3 py-2">
                            {isCurrent ? (
                              <Badge variant="default">Aktiv</Badge>
                            ) : isFuture ? (
                              <Badge variant="outline">Zukünftig</Badge>
                            ) : (
                              <Badge variant="secondary">Historisch</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              aria-label={`Tagessatz ${r.role_key} ab ${r.valid_from} löschen`}
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Tagessatz '${r.role_key}' ab ${r.valid_from} wirklich löschen?\n\n` +
                                      "Hinweis: bestehende Cost-Lines werden NICHT zurückgerechnet — die Aktion ist " +
                                      "nur für Tippfehler-Korrekturen gedacht."
                                  )
                                ) {
                                  return
                                }
                                try {
                                  await remove(r.id)
                                  toast.success("Tagessatz gelöscht.")
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error ? err.message : "Fehler."
                                  )
                                }
                              }}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateRoleRateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existingRoleKeys={Array.from(new Set(rates.map((r) => r.role_key)))}
        onSubmit={async (input) => {
          await create(input)
          toast.success("Tagessatz gespeichert.")
        }}
      />
    </div>
  )
}

function formatRate(rate: number): string {
  return rate.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface GroupedRates {
  roleKey: string
  items: RoleRate[]
}

/** Gruppiert nach role_key, sortiert Items pro Rolle nach valid_from DESC. */
function groupByRole(rates: RoleRate[]): GroupedRates[] {
  const map = new Map<string, RoleRate[]>()
  for (const r of rates) {
    const arr = map.get(r.role_key) ?? []
    arr.push(r)
    map.set(r.role_key, arr)
  }
  const groups: GroupedRates[] = []
  for (const [roleKey, items] of map) {
    items.sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))
    groups.push({ roleKey, items })
  }
  groups.sort((a, b) => a.roleKey.localeCompare(b.roleKey))
  return groups
}

interface CreateRoleRateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingRoleKeys: string[]
  onSubmit: (input: RoleRateInput) => Promise<unknown>
}

function CreateRoleRateDialog({
  open,
  onOpenChange,
  existingRoleKeys,
  onSubmit,
}: CreateRoleRateDialogProps) {
  const [roleKey, setRoleKey] = React.useState("")
  const [dailyRate, setDailyRate] = React.useState("")
  const [currency, setCurrency] = React.useState<SupportedCurrency>("EUR")
  const [validFrom, setValidFrom] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setRoleKey("")
      setDailyRate("")
      setCurrency("EUR")
      setValidFrom(new Date().toISOString().slice(0, 10))
    }
  }, [open])

  async function handleSubmit() {
    const trimmedKey = roleKey.trim()
    if (trimmedKey.length === 0) {
      toast.error("Rollen-Schlüssel darf nicht leer sein.")
      return
    }
    if (trimmedKey.length > 100) {
      toast.error("Rollen-Schlüssel darf maximal 100 Zeichen lang sein.")
      return
    }
    const rateNum = Number(dailyRate)
    if (!Number.isFinite(rateNum) || rateNum < 0) {
      toast.error("Tagessatz muss eine nicht-negative Zahl sein.")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      toast.error("Datum im Format YYYY-MM-DD erforderlich.")
      return
    }
    try {
      setBusy(true)
      await onSubmit({
        role_key: trimmedKey,
        daily_rate: rateNum,
        currency,
        valid_from: validFrom,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tagessatz hinzufügen</DialogTitle>
          <DialogDescription>
            Eine Rate gilt ab dem gewählten Datum bis sie durch eine neuere
            Version ersetzt wird. Bestehende Cost-Lines bleiben mit ihrem
            damaligen Satz unverändert.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="rr-role-key">Rollen-Schlüssel</Label>
            <Input
              id="rr-role-key"
              type="text"
              autoFocus
              list="rr-existing-role-keys"
              placeholder="z. B. senior-developer"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              maxLength={100}
            />
            {existingRoleKeys.length > 0 && (
              <datalist id="rr-existing-role-keys">
                {existingRoleKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            )}
            <p className="text-[11px] text-muted-foreground">
              Frei wählbar — die kanonischen Werte stehen im Projekt-Typ-Catalog,
              eigene Rollen sind erlaubt (z. B. „sondersachbearbeiter-baurecht“).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rr-rate">Tagessatz</Label>
              <Input
                id="rr-rate"
                type="number"
                step="0.01"
                min="0"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="1200.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rr-currency">Währung</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as SupportedCurrency)}
              >
                <SelectTrigger id="rr-currency">
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
            <Label htmlFor="rr-valid">Gültig ab</Label>
            <Input
              id="rr-valid"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
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
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Speichert …
              </>
            ) : (
              "Hinzufügen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
