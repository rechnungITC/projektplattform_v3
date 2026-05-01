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
import type { BudgetPostingInput } from "@/lib/budget/api"
import type { BudgetItem } from "@/types/budget"
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"

interface BudgetPostingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: BudgetItem
  onSubmit: (input: BudgetPostingInput) => Promise<unknown>
}

export function BudgetPostingDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
}: BudgetPostingDialogProps) {
  const [kind, setKind] = React.useState<"actual" | "reservation">("actual")
  const [amount, setAmount] = React.useState("0")
  const [currency, setCurrency] = React.useState<SupportedCurrency>(
    item.planned_currency
  )
  const [postedAt, setPostedAt] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setKind("actual")
      setAmount("0")
      setCurrency(item.planned_currency)
      setPostedAt(new Date().toISOString().slice(0, 10))
      setNote("")
    }
  }, [open, item])

  async function handleSubmit() {
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error("Betrag muss eine nicht-negative Zahl sein.")
      return
    }
    try {
      setBusy(true)
      await onSubmit({
        item_id: item.id,
        kind,
        amount: amountNum,
        currency,
        posted_at: postedAt,
        note: note.trim() || null,
      })
      onOpenChange(false)
      toast.success("Buchung angelegt.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Buchen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buchung auf „{item.name}&ldquo;</DialogTitle>
          <DialogDescription>
            Plan: {item.planned_amount} {item.planned_currency}. Beträge in
            Fremdwährung erscheinen als Multi-Currency-Hinweis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Art</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as "actual" | "reservation")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="actual">Buchung (Ist)</SelectItem>
                <SelectItem value="reservation">Reservierung</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="post-amount">Betrag</Label>
              <Input
                id="post-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="post-currency">Währung</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as SupportedCurrency)}
              >
                <SelectTrigger id="post-currency">
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
            <Label htmlFor="post-date">Datum</Label>
            <Input
              id="post-date"
              type="date"
              value={postedAt}
              onChange={(e) => setPostedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="post-note">Beleg-Notiz (optional)</Label>
            <Textarea
              id="post-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="z.B. Rechnungsnummer, Lieferant, Kontext"
            />
            <p className="text-[11px] text-muted-foreground">
              Achtung: Notiz wird als Class-3-PII behandelt — bitte keine
              vermeidbaren Personennamen aufnehmen.
            </p>
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
            {busy ? "Bucht …" : "Buchen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
