"use client"

import { Download } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

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
import {
  fetchUtilization,
  utilizationCsvUrl,
} from "@/lib/resources/api"
import { cn } from "@/lib/utils"
import {
  UTILIZATION_BUCKET_LABELS,
  UTILIZATION_BUCKETS,
  type UtilizationBucket,
  type UtilizationCell,
} from "@/types/resource"

const DATE_FMT_DAY = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
})

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusDaysIso(base: string, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function heatClass(util: number): string {
  // util is in 0–100+ scale (already includes fte × availability)
  if (util > 100) {
    return "bg-red-500/80 text-white dark:bg-red-600"
  }
  if (util > 90) {
    return "bg-amber-400/80 text-amber-950 dark:bg-amber-500"
  }
  if (util >= 50) {
    return "bg-emerald-400/40 text-emerald-950 dark:bg-emerald-700/60 dark:text-emerald-100"
  }
  if (util > 0) {
    return "bg-emerald-200/40 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200"
  }
  return "bg-muted/40 text-muted-foreground"
}

interface BucketKey {
  bucket_start: string
  bucket_end: string
}

function bucketKey(c: UtilizationCell | BucketKey): string {
  return `${c.bucket_start}|${c.bucket_end}`
}

export function UtilizationHeatmap() {
  const [start, setStart] = React.useState(todayIso())
  const [end, setEnd] = React.useState(plusDaysIso(todayIso(), 90))
  const [bucket, setBucket] = React.useState<UtilizationBucket>("week")
  const [cells, setCells] = React.useState<UtilizationCell[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (start > end) {
      setError("Start-Datum muss vor End-Datum liegen.")
      return
    }
    try {
      setLoading(true)
      setError(null)
      const result = await fetchUtilization({ start, end, bucket })
      setCells(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [start, end, bucket])

  React.useEffect(() => {
    void load()
  }, [load])

  // Pivot: { resourceId → { resourceName, cellsByBucket } }
  const pivot = React.useMemo(() => {
    const buckets = new Map<string, BucketKey>()
    const byResource = new Map<
      string,
      {
        name: string
        cells: Map<string, UtilizationCell>
      }
    >()
    for (const c of cells) {
      const bk = bucketKey(c)
      buckets.set(bk, { bucket_start: c.bucket_start, bucket_end: c.bucket_end })
      let row = byResource.get(c.resource_id)
      if (!row) {
        row = { name: c.resource_name, cells: new Map() }
        byResource.set(c.resource_id, row)
      }
      row.cells.set(bk, c)
    }
    const orderedBuckets = Array.from(buckets.values()).sort((a, b) =>
      a.bucket_start.localeCompare(b.bucket_start)
    )
    const orderedRows = Array.from(byResource.entries()).sort(([, a], [, b]) =>
      a.name.localeCompare(b.name)
    )
    return { buckets: orderedBuckets, rows: orderedRows }
  }, [cells])

  function exportCsv() {
    if (start > end) {
      toast.error("Start-Datum muss vor End-Datum liegen.")
      return
    }
    const url = utilizationCsvUrl({ start, end, bucket })
    window.open(url, "_blank")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        <div>
          <Label htmlFor="util_start">Von</Label>
          <Input
            id="util_start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="util_end">Bis</Label>
          <Input
            id="util_end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="util_bucket">Granularität</Label>
          <Select
            value={bucket}
            onValueChange={(v) => setBucket(v as UtilizationBucket)}
          >
            <SelectTrigger id="util_bucket" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UTILIZATION_BUCKETS.map((b) => (
                <SelectItem key={b} value={b}>
                  {UTILIZATION_BUCKET_LABELS[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={() => void load()}>
            Aktualisieren
          </Button>
          <Button type="button" variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" aria-hidden /> CSV
          </Button>
        </div>
      </div>

      <Legend />

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Auslastung …</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : pivot.rows.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Keine Daten im gewählten Zeitraum. Lege Ressourcen an und alloziere
          sie auf Work Items mit Phase oder Sprint.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left">
                  Ressource
                </th>
                {pivot.buckets.map((b) => (
                  <th
                    key={bucketKey(b)}
                    className="whitespace-nowrap px-2 py-2 text-center text-xs"
                  >
                    {DATE_FMT_DAY.format(new Date(b.bucket_start))}
                    <br />
                    <span className="text-muted-foreground">
                      –{DATE_FMT_DAY.format(new Date(b.bucket_end))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map(([rid, row]) => (
                <tr key={rid} className="border-t">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium">
                    {row.name}
                  </td>
                  {pivot.buckets.map((b) => {
                    const cell = row.cells.get(bucketKey(b))
                    const value = cell ? Number(cell.utilization) : 0
                    return (
                      <td
                        key={bucketKey(b)}
                        className={cn(
                          "px-2 py-2 text-center text-xs tabular-nums",
                          heatClass(value)
                        )}
                        title={`${row.name} · ${b.bucket_start} – ${b.bucket_end}: ${value.toFixed(1)}%`}
                      >
                        {value > 0 ? `${value.toFixed(0)}%` : "—"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="font-medium">Heat:</span>
      <span className="flex items-center gap-1">
        <span className={cn("inline-block h-3 w-6 rounded", heatClass(0))} /> 0%
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("inline-block h-3 w-6 rounded", heatClass(30))} />{" "}
        ≤ 50%
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("inline-block h-3 w-6 rounded", heatClass(70))} />{" "}
        50–90%
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("inline-block h-3 w-6 rounded", heatClass(95))} />{" "}
        &gt; 90%
      </span>
      <span className="flex items-center gap-1">
        <span className={cn("inline-block h-3 w-6 rounded", heatClass(120))} />{" "}
        &gt; 100% (Überbuchung)
      </span>
    </div>
  )
}
