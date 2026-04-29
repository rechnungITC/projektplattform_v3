"use client"

import { Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type AvailabilityInput,
  createAvailability,
  deleteAvailability,
  listAvailabilities,
} from "@/lib/resources/api"
import type { ResourceAvailability } from "@/types/resource"

interface AvailabilityListProps {
  resourceId: string
}

const DATE_FMT = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" })

export function AvailabilityList({ resourceId }: AvailabilityListProps) {
  const [items, setItems] = React.useState<ResourceAvailability[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Inline new-segment form state
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [fte, setFte] = React.useState("")
  const [note, setNote] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listAvailabilities(resourceId)
      setItems(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [resourceId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  async function add() {
    const fteNum = Number.parseFloat(fte)
    if (!startDate || !endDate || !Number.isFinite(fteNum)) {
      toast.error("Bitte Start, Ende und FTE eintragen.")
      return
    }
    if (fteNum < 0 || fteNum > 1) {
      toast.error("FTE muss zwischen 0 und 1 liegen.")
      return
    }
    if (startDate > endDate) {
      toast.error("Start-Datum muss vor End-Datum liegen.")
      return
    }
    const input: AvailabilityInput = {
      start_date: startDate,
      end_date: endDate,
      fte: fteNum,
      note: note.trim() || null,
    }
    setSubmitting(true)
    try {
      await createAvailability(resourceId, input)
      toast.success("Segment angelegt")
      setStartDate("")
      setEndDate("")
      setFte("")
      setNote("")
      await refresh()
    } catch (err) {
      toast.error("Anlegen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Segment wirklich löschen?")) return
    try {
      await deleteAvailability(resourceId, id)
      toast.success("Segment gelöscht")
      await refresh()
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium">Verfügbarkeits-Segmente</h4>
        <p className="text-xs text-muted-foreground">
          Optionale Datumsabschnitte, in denen die FTE-Verfügbarkeit vom
          Standardwert abweicht (z. B. Urlaub, Reduzierung).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade …</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Segmente — der Standardwert gilt durchgängig.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((seg) => (
            <li
              key={seg.id}
              className="flex items-center justify-between gap-3 p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p>
                  {DATE_FMT.format(new Date(seg.start_date))} –{" "}
                  {DATE_FMT.format(new Date(seg.end_date))}
                </p>
                <p className="text-xs text-muted-foreground">
                  FTE {seg.fte.toString()}
                  {seg.note ? ` · ${seg.note}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void remove(seg.id)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Neues Segment
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="start_date">Von</Label>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="end_date">Bis</Label>
            <Input
              id="end_date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fte_seg">FTE (0.0 – 1.0)</Label>
            <Input
              id="fte_seg"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={fte}
              onChange={(e) => setFte(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="note">Notiz (optional)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => void add()}
            disabled={submitting}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Segment hinzufügen
          </Button>
        </div>
      </div>
    </div>
  )
}
