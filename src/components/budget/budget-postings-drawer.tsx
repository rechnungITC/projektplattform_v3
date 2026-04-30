"use client"

import { History, Loader2, RotateCcw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useBudgetPostings } from "@/hooks/use-budget"
import {
  BUDGET_POSTING_KIND_LABELS,
  type BudgetItem,
} from "@/types/budget"

import { formatCurrency } from "./format"
import type { SupportedCurrency } from "@/types/tenant-settings"

interface BudgetPostingsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: BudgetItem | null
  canEdit: boolean
  onChange?: () => void | Promise<void>
}

export function BudgetPostingsDrawer({
  open,
  onOpenChange,
  projectId,
  item,
  canEdit,
  onChange,
}: BudgetPostingsDrawerProps) {
  const { postings, loading, error, reverse, refresh } = useBudgetPostings(
    projectId,
    open ? item?.id ?? null : null
  )
  const [busyPostingId, setBusyPostingId] = React.useState<string | null>(null)

  // Track which postings are reversed (have a sibling reversal pointing at them)
  const reversedIds = new Set(
    postings
      .filter((p) => p.kind === "reversal" && p.reverses_posting_id)
      .map((p) => p.reverses_posting_id as string)
  )

  async function handleReverse(postingId: string) {
    if (!confirm("Buchung wirklich stornieren? Eine negative Gegenbuchung wird angelegt.")) return
    try {
      setBusyPostingId(postingId)
      await reverse(postingId)
      toast.success("Buchung storniert.")
      if (onChange) await onChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Storno fehlgeschlagen.")
    } finally {
      setBusyPostingId(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" aria-hidden />
            Buchungs-Historie
          </SheetTitle>
          <SheetDescription>
            {item ? `${item.name} — Plan: ${formatCurrency(item.planned_amount, item.planned_currency as SupportedCurrency)}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : postings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Buchungen.
            </p>
          ) : (
            <ul className="space-y-2">
              {postings.map((p) => {
                const isReversed = reversedIds.has(p.id)
                const isReversal = p.kind === "reversal"
                return (
                  <li
                    key={p.id}
                    className="rounded-md border bg-background p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={isReversal ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {BUDGET_POSTING_KIND_LABELS[p.kind]}
                          </Badge>
                          {isReversed ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-muted-foreground"
                            >
                              storniert
                            </Badge>
                          ) : null}
                          {p.source === "vendor_invoice" ? (
                            <Badge variant="outline" className="text-xs">
                              Rechnung
                            </Badge>
                          ) : null}
                        </div>
                        <p
                          className={
                            isReversal || isReversed
                              ? "mt-1 font-mono text-base text-muted-foreground line-through"
                              : "mt-1 font-mono text-base"
                          }
                        >
                          {formatCurrency(p.amount, p.currency as SupportedCurrency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.posted_at}
                        </p>
                        {p.note ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.note}
                          </p>
                        ) : null}
                      </div>
                      {canEdit && !isReversal && !isReversed ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleReverse(p.id)}
                          disabled={busyPostingId === p.id}
                          aria-label="Buchung stornieren"
                        >
                          <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
                          Storno
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          className="sr-only"
        >
          Aktualisieren
        </button>
      </SheetContent>
    </Sheet>
  )
}
