"use client"

import { Loader2, Plus, Trash2 } from "lucide-react"
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
import { useVendorInvoices } from "@/hooks/use-vendor-invoices"
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"

import { formatCurrency } from "./format"

interface VendorInvoicesTabProps {
  vendorId: string
  canEdit: boolean
}

export function VendorInvoicesTab({ vendorId, canEdit }: VendorInvoicesTabProps) {
  const { invoices, loading, error, create, remove } = useVendorInvoices(vendorId)
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {invoices.length} Rechnung{invoices.length === 1 ? "" : "en"}
        </p>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Rechnung anlegen
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Rechnungen.</p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => {
            const total = inv.gross_amount
            const booked = inv.booked_amount
            const remaining = Math.max(0, total - booked)
            return (
              <li
                key={inv.id}
                className="flex items-start justify-between gap-2 rounded-md border bg-background p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="text-xs text-muted-foreground">
                      {inv.invoice_date}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-base">
                    {formatCurrency(total, inv.currency as SupportedCurrency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gebucht{" "}
                    {formatCurrency(booked, inv.currency as SupportedCurrency)} ·
                    Offen{" "}
                    {formatCurrency(remaining, inv.currency as SupportedCurrency)}
                  </p>
                  {inv.note ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {inv.note}
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Rechnung löschen"
                    onClick={async () => {
                      if (!confirm(`Rechnung „${inv.invoice_number}" löschen? Bereits abgeleitete Buchungen bleiben erhalten.`)) return
                      try {
                        await remove(inv.id)
                        toast.success("Rechnung gelöscht.")
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
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (input) => {
          await create(input)
          toast.success("Rechnung angelegt.")
        }}
      />
    </div>
  )
}

interface CreateInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: import("@/lib/budget/api").VendorInvoiceInput) => Promise<unknown>
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateInvoiceDialogProps) {
  const [number, setNumber] = React.useState("")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [grossAmount, setGrossAmount] = React.useState("0")
  const [currency, setCurrency] = React.useState<SupportedCurrency>("EUR")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setNumber("")
      setDate(new Date().toISOString().slice(0, 10))
      setGrossAmount("0")
      setCurrency("EUR")
      setNote("")
    }
  }, [open])

  async function handleSubmit() {
    if (!number.trim()) {
      toast.error("Rechnungsnummer ist erforderlich.")
      return
    }
    const amount = Number(grossAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Brutto-Betrag muss eine nicht-negative Zahl sein.")
      return
    }
    try {
      setBusy(true)
      await onSubmit({
        invoice_number: number.trim(),
        invoice_date: date,
        gross_amount: amount,
        currency,
        note: note.trim() || null,
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
          <DialogTitle>Rechnung anlegen</DialogTitle>
          <DialogDescription>
            Vendor-Rechnung. Die Rechnung kann später auf Budget-Posten gebucht
            werden.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="inv-number">Rechnungsnummer</Label>
            <Input
              id="inv-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-date">Rechnungsdatum</Label>
            <Input
              id="inv-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="inv-amount">Brutto-Betrag</Label>
              <Input
                id="inv-amount"
                type="number"
                step="0.01"
                min="0"
                value={grossAmount}
                onChange={(e) => setGrossAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-currency">Währung</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as SupportedCurrency)}
              >
                <SelectTrigger id="inv-currency">
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
            <Label htmlFor="inv-note">Notiz (optional)</Label>
            <Textarea
              id="inv-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            {busy ? "Speichert …" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
