"use client"

import { AlertTriangle, Loader2, Plus, Receipt } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import {
  createManualCostLine,
  listWorkItemCostLines,
  type ManualCostLineInput,
  type WorkItemCostLine,
} from "@/lib/cost/api"
import {
  COST_SETTINGS_DEFAULTS,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/types/tenant-settings"

/**
 * PROJ-24 ST-08 — Cost section in the work-item detail drawer.
 *
 * Reads cost-lines from `work_item_cost_lines` (resource_allocation +
 * manual). Shows aggregated total when all lines are in one currency,
 * a multi-currency banner otherwise. PMs can add a manual cost-line via
 * a small dialog. Engine-derived cost-lines (`source_type='resource_allocation'`)
 * are read-only here — they're rewritten by the synthesizer in the backend
 * whenever an allocation or cost-driver attribute changes.
 */

interface WorkItemCostSectionProps {
  projectId: string
  workItemId: string
  canEdit: boolean
}

export function WorkItemCostSection({
  projectId,
  workItemId,
  canEdit,
}: WorkItemCostSectionProps) {
  const [lines, setLines] = React.useState<WorkItemCostLine[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const list = await listWorkItemCostLines(projectId, workItemId)
        if (cancelled) return
        setLines(list)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, workItemId, tick])

  const refresh = React.useCallback(() => setTick((t) => t + 1), [])

  const totals = React.useMemo(() => aggregateLines(lines), [lines])
  const isMultiCurrency = totals.currencies.size > 1
  const sortedLines = React.useMemo(() => {
    return [...lines].sort((a, b) => {
      // resource_allocation first, then manual, then by created_at desc.
      const order: Record<string, number> = {
        resource_allocation: 0,
        manual: 1,
      }
      const aOrder = order[a.source_type] ?? 99
      const bOrder = order[b.source_type] ?? 99
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.created_at < b.created_at ? 1 : -1
    })
  }, [lines])

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4" aria-hidden />
          Kosten
        </CardTitle>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            Manuelle Cost-Line
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lädt …
          </div>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine Cost-Lines. Plan-Kosten werden automatisch erzeugt, sobald
            Ressourcen zugeordnet und Tagessätze gepflegt sind.
          </p>
        ) : (
          <>
            {isMultiCurrency && (
              <Alert>
                <AlertTriangle className="h-4 w-4" aria-hidden />
                <AlertTitle>Mehrere Währungen</AlertTitle>
                <AlertDescription>
                  Dieses Item hat Cost-Lines in unterschiedlichen Währungen.
                  Eine Sammelwährung muss über die FX-Rates aggregiert werden;
                  die Drawer-Anzeige listet pro Währung getrennt.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Plan-Kosten
              </p>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {Array.from(totals.byCurrency.entries()).map(
                  ([currency, total]) => (
                    <span
                      key={currency}
                      className="font-mono text-base tabular-nums"
                    >
                      {formatAmount(total)} {currency}
                    </span>
                  )
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {totals.lineCount} Cost-Line{totals.lineCount === 1 ? "" : "s"}
                {totals.estimatedCount > 0 && (
                  <>
                    {" · "}
                    {totals.estimatedCount} geschätzt (Story-Point-basiert)
                  </>
                )}
              </p>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Quelle</th>
                    <th className="px-3 py-2 text-right font-medium">Betrag</th>
                    <th className="px-3 py-2 text-left font-medium">Währung</th>
                    <th className="px-3 py-2 text-left font-medium">Datum</th>
                    <th className="px-3 py-2 text-left font-medium">Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLines.map((line) => (
                    <tr key={line.id} className="border-t last:border-b-0">
                      <td className="px-3 py-2">
                        <SourceTypeBadge type={line.source_type} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {prefixForLine(line)}
                        {formatAmount(Number(line.amount))}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {line.currency}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">
                        {line.occurred_on ??
                          new Date(line.created_at).toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {warningHint(line)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {canEdit && (
          <ManualCostLineDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            onSubmit={async (input) => {
              await createManualCostLine(projectId, workItemId, input)
              toast.success("Manuelle Cost-Line gespeichert.")
              refresh()
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

function aggregateLines(lines: WorkItemCostLine[]): {
  byCurrency: Map<SupportedCurrency, number>
  currencies: Set<SupportedCurrency>
  lineCount: number
  estimatedCount: number
} {
  const byCurrency = new Map<SupportedCurrency, number>()
  let estimatedCount = 0
  for (const l of lines) {
    const prev = byCurrency.get(l.currency) ?? 0
    byCurrency.set(l.currency, prev + Number(l.amount))
    if (
      l.source_type === "resource_allocation" &&
      l.source_metadata &&
      typeof l.source_metadata === "object" &&
      "basis" in l.source_metadata &&
      l.source_metadata.basis === "story_points"
    ) {
      estimatedCount += 1
    }
  }
  return {
    byCurrency,
    currencies: new Set(byCurrency.keys()),
    lineCount: lines.length,
    estimatedCount,
  }
}

function prefixForLine(line: WorkItemCostLine): string {
  if (
    line.source_type === "resource_allocation" &&
    line.source_metadata &&
    typeof line.source_metadata === "object" &&
    "basis" in line.source_metadata &&
    line.source_metadata.basis === "story_points"
  ) {
    return "≈ "
  }
  return ""
}

function warningHint(line: WorkItemCostLine): string {
  const meta = line.source_metadata
  if (!meta || typeof meta !== "object") return ""
  if ("warning" in meta && typeof meta.warning === "string") {
    switch (meta.warning) {
      case "no_rate_for_role":
        return "Tagessatz für Rolle fehlt"
      case "no_role_key":
        return "Stakeholder ohne Rolle"
      case "no_stakeholder":
        return "Ressource ohne Stakeholder-Bezug"
      case "no_basis":
        return "Weder Dauer noch SP gepflegt"
      default:
        return String(meta.warning)
    }
  }
  return ""
}

function formatAmount(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function SourceTypeBadge({ type }: { type: WorkItemCostLine["source_type"] }) {
  if (type === "resource_allocation") {
    return <Badge variant="secondary">Ressource</Badge>
  }
  if (type === "manual") {
    return <Badge variant="outline">Manuell</Badge>
  }
  return <Badge variant="outline">{type}</Badge>
}

interface ManualCostLineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ManualCostLineInput) => Promise<unknown>
}

function ManualCostLineDialog({
  open,
  onOpenChange,
  onSubmit,
}: ManualCostLineDialogProps) {
  const { tenantSettings } = useAuth()
  const defaultCurrency =
    tenantSettings?.cost_settings?.default_currency ??
    COST_SETTINGS_DEFAULTS.default_currency

  const [amount, setAmount] = React.useState("")
  const [currency, setCurrency] =
    React.useState<SupportedCurrency>(defaultCurrency)
  const [occurredOn, setOccurredOn] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setAmount("")
      setCurrency(defaultCurrency)
      setOccurredOn(new Date().toISOString().slice(0, 10))
      setNote("")
    }
  }, [open, defaultCurrency])

  async function handleSubmit() {
    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error("Betrag muss eine nicht-negative Zahl sein.")
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      toast.error("Datum im Format YYYY-MM-DD erforderlich.")
      return
    }
    try {
      setBusy(true)
      const trimmedNote = note.trim()
      const sourceMetadata: Record<string, unknown> | undefined =
        trimmedNote.length > 0 ? { note: trimmedNote } : undefined
      await onSubmit({
        amount: amountNum,
        currency,
        occurred_on: occurredOn,
        source_metadata: sourceMetadata,
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
          <DialogTitle>Manuelle Cost-Line</DialogTitle>
          <DialogDescription>
            Für Kosten, die nicht über Ressourcen-Allocations entstehen
            (z. B. Software-Lizenz, einmalige Beratungsleistung).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="cl-amount">Betrag</Label>
              <Input
                id="cl-amount"
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cl-currency">Währung</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as SupportedCurrency)}
              >
                <SelectTrigger id="cl-currency">
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
            <Label htmlFor="cl-date">Datum</Label>
            <Input
              id="cl-date"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cl-note">Notiz (optional)</Label>
            <Input
              id="cl-note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="z. B. Lizenzkosten Q1"
            />
            <p className="text-[11px] text-muted-foreground">
              Class-3 — nicht an externe LLMs senden.
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
