"use client"

import { ArrowDown, ArrowUp, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { Phase } from "@/types/phase"

interface ReorderPhasesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  phases: Phase[]
  onReordered: () => void | Promise<void>
}

/**
 * Sheet-based reorder UI. Per ADR `backlog-board-view`: no drag-and-drop in
 * V1 — phases are few (3-8 typical), up/down arrow buttons are sufficient
 * and accessible by default.
 */
export function ReorderPhasesDialog({
  open,
  onOpenChange,
  projectId,
  phases,
  onReordered,
}: ReorderPhasesDialogProps) {
  const [orderedIds, setOrderedIds] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setOrderedIds(phases.map((p) => p.id))
    }
  }, [open, phases])

  const phaseById = React.useMemo(() => {
    const map = new Map<string, Phase>()
    for (const p of phases) map.set(p.id, p)
    return map
  }, [phases])

  const dirty = React.useMemo(() => {
    if (orderedIds.length !== phases.length) return false
    for (let i = 0; i < orderedIds.length; i += 1) {
      if (orderedIds[i] !== phases[i].id) return true
    }
    return false
  }, [orderedIds, phases])

  function moveUp(index: number) {
    if (index <= 0) return
    setOrderedIds((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  function moveDown(index: number) {
    setOrderedIds((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
      return next
    })
  }

  async function onSubmit() {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/phases/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_ids: orderedIds }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "POST /api/projects/[id]/phases/reorder ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Reihenfolge konnte nicht gespeichert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Reihenfolge gespeichert")
      await onReordered()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Reihenfolge konnte nicht gespeichert werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Phasen sortieren</SheetTitle>
          <SheetDescription>
            Mit den Pfeilen verschiebst du Phasen nach oben oder unten. Beim
            Speichern werden alle Sequenznummern atomar neu vergeben.
          </SheetDescription>
        </SheetHeader>

        <ol
          className="mt-6 space-y-2"
          aria-label="Phasenreihenfolge"
        >
          {orderedIds.map((id, index) => {
            const phase = phaseById.get(id)
            if (!phase) return null
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border bg-card p-2"
              >
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                >
                  {index + 1}
                </span>
                <span className="flex-1 truncate text-sm">{phase.name}</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`„${phase.name}" nach oben`}
                    onClick={() => moveUp(index)}
                    disabled={submitting || index === 0}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`„${phase.name}" nach unten`}
                    onClick={() => moveDown(index)}
                    disabled={submitting || index === orderedIds.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            )
          })}
        </ol>

        {orderedIds.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Keine Phasen vorhanden.
          </p>
        ) : null}

        <SheetFooter className="mt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={() => void onSubmit()}
            disabled={!dirty || submitting}
          >
            {submitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            Speichern
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string }
      message?: string
    }
    if (typeof data.error === "string") return data.error
    if (data.error && typeof data.error === "object") {
      return data.error.message ?? `Anfrage fehlgeschlagen (${response.status})`
    }
    return data.message ?? `Anfrage fehlgeschlagen (${response.status})`
  } catch {
    return `Anfrage fehlgeschlagen (${response.status})`
  }
}
