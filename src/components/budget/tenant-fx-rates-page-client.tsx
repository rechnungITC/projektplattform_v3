"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

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
import { useFxRates } from "@/hooks/use-fx-rates"
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"

export function TenantFxRatesPageClient() {
  const { currentTenant, currentRole } = useAuth()
  const isAdmin = currentRole === "admin"
  const tenantId = currentTenant?.id ?? null

  if (!tenantId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FX-Raten</CardTitle>
          <CardDescription>
            Kein aktiver Tenant ausgewählt.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FX-Raten</CardTitle>
          <CardDescription>
            Nur Tenant-Admins können FX-Raten pflegen.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return <FxRatesAdmin tenantId={tenantId} />
}

function FxRatesAdmin({ tenantId }: { tenantId: string }) {
  const { rates, loading, error, create, remove } = useFxRates(tenantId)
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">FX-Raten</h1>
          <p className="text-sm text-muted-foreground">
            Manuell gepflegte Wechselkurse für Sammelwährungs-Reports im Budget-Modul.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden />
          Rate hinzufügen
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : rates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Noch keine Raten gepflegt.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Pair</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-left font-medium">Gültig ab</th>
                  <th className="px-3 py-2 text-left font-medium">Quelle</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.from_currency} → {r.to_currency}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(r.rate).toFixed(6)}
                    </td>
                    <td className="px-3 py-2">{r.valid_on}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.source}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Rate löschen"
                        onClick={async () => {
                          if (!confirm("Rate wirklich löschen?")) return
                          try {
                            await remove(r.id)
                            toast.success("Rate gelöscht.")
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
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <CreateFxRateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (input) => {
          await create(input)
          toast.success("Rate gespeichert.")
        }}
      />
    </div>
  )
}

interface CreateFxRateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: import("@/lib/budget/api").FxRateInput) => Promise<unknown>
}

function CreateFxRateDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateFxRateDialogProps) {
  const [from, setFrom] = React.useState<SupportedCurrency>("USD")
  const [to, setTo] = React.useState<SupportedCurrency>("EUR")
  const [rate, setRate] = React.useState("1")
  const [validOn, setValidOn] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setFrom("USD")
      setTo("EUR")
      setRate("1")
      setValidOn(new Date().toISOString().slice(0, 10))
    }
  }, [open])

  async function handleSubmit() {
    if (from === to) {
      toast.error("Ausgangs- und Ziel-Währung müssen unterschiedlich sein.")
      return
    }
    const rateNum = Number(rate)
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      toast.error("Rate muss eine positive Zahl sein.")
      return
    }
    try {
      setBusy(true)
      await onSubmit({
        from_currency: from,
        to_currency: to,
        rate: rateNum,
        valid_on: validOn,
        source: "manual",
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
          <DialogTitle>FX-Rate hinzufügen</DialogTitle>
          <DialogDescription>
            Eine Rate gilt ab dem gewählten Datum bis sie überschrieben wird.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="fx-from">Von</Label>
              <Select
                value={from}
                onValueChange={(v) => setFrom(v as SupportedCurrency)}
              >
                <SelectTrigger id="fx-from">
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
            <div className="space-y-1">
              <Label htmlFor="fx-to">Nach</Label>
              <Select
                value={to}
                onValueChange={(v) => setTo(v as SupportedCurrency)}
              >
                <SelectTrigger id="fx-to">
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
            <Label htmlFor="fx-rate">Rate</Label>
            <Input
              id="fx-rate"
              type="number"
              step="0.00000001"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              1 {from} = X {to}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fx-valid">Gültig ab</Label>
            <Input
              id="fx-valid"
              type="date"
              value={validOn}
              onChange={(e) => setValidOn(e.target.value)}
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
            {busy ? "Speichert …" : "Hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
