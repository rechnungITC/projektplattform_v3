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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Phase } from "@/types/phase"
import type { WorkItemWithProfile } from "@/types/work-item"

const NO_PHASE_VALUE = "__none__"

interface BulkAssignPhaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /** Items the user has currently selected. */
  items: WorkItemWithProfile[]
  /** Phases of the project. */
  phases: Phase[]
  /** Re-load lists after success. */
  onAssigned: () => void | Promise<void>
}

/**
 * Bulk-assigns a phase (or "no phase") to all selected work-items via
 * parallel PATCH calls. Single-item PATCH is the existing API contract;
 * we don't introduce a new bulk endpoint here — at <500 items per project,
 * Promise.all() against the existing route is fine and keeps RLS + audit
 * triggers firing per-row.
 */
export function BulkAssignPhaseDialog({
  open,
  onOpenChange,
  projectId,
  items,
  phases,
  onAssigned,
}: BulkAssignPhaseDialogProps) {
  const [phaseId, setPhaseId] = React.useState<string>(NO_PHASE_VALUE)
  const [submitting, setSubmitting] = React.useState(false)

  // Note: phaseId persists between dialog opens. That's intentional — if a
  // user is bulk-reassigning multiple batches to the same target phase,
  // the previous selection is a useful default. Submit closes the dialog;
  // Cancel keeps the value for the next time.

  const targetPhase =
    phaseId === NO_PHASE_VALUE
      ? null
      : phases.find((p) => p.id === phaseId) ?? null
  const targetLabel =
    phaseId === NO_PHASE_VALUE
      ? "Keine Phase (Phase-Zuordnung entfernen)"
      : targetPhase
      ? `${targetPhase.sequence_number}. ${targetPhase.name}`
      : "—"

  const handleSubmit = React.useCallback(async () => {
    setSubmitting(true)
    const targetPhaseId = phaseId === NO_PHASE_VALUE ? null : phaseId

    type Result = { id: string; ok: boolean; error?: string }
    const results: Result[] = await Promise.all(
      items.map(async (item) => {
        try {
          const res = await fetch(
            `/api/projects/${projectId}/work-items/${item.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phase_id: targetPhaseId }),
            },
          )
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              error?: { message?: string }
            } | null
            return {
              id: item.id,
              ok: false,
              error: body?.error?.message ?? `HTTP ${res.status}`,
            }
          }
          return { id: item.id, ok: true }
        } catch (err) {
          return {
            id: item.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }),
    )

    const okCount = results.filter((r) => r.ok).length
    const failCount = results.length - okCount

    if (failCount === 0) {
      toast.success(
        `${okCount} Arbeitspaket${okCount === 1 ? "" : "e"} zugeordnet`,
        { description: targetLabel },
      )
    } else if (okCount === 0) {
      toast.error("Bulk-Zuordnung fehlgeschlagen", {
        description: results.find((r) => !r.ok)?.error ?? "Unbekannter Fehler",
      })
    } else {
      toast.warning(`${okCount} OK · ${failCount} fehlgeschlagen`, {
        description: results.find((r) => !r.ok)?.error,
      })
    }

    await onAssigned()
    setSubmitting(false)
    if (failCount === 0) onOpenChange(false)
  }, [items, phaseId, projectId, targetLabel, onAssigned, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Phase zuweisen</DialogTitle>
          <DialogDescription>
            Ändert die Phase für{" "}
            <strong>
              {items.length} ausgewählte{items.length === 1 ? "s" : ""}{" "}
              Arbeitspaket{items.length === 1 ? "" : "e"}
            </strong>
            . Bestehende Phase-Zuordnung wird überschrieben.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Select
            value={phaseId}
            onValueChange={setPhaseId}
            disabled={submitting}
          >
            <SelectTrigger>
              <SelectValue placeholder="Phase wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PHASE_VALUE}>
                Keine Phase (entfernen)
              </SelectItem>
              {phases.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.sequence_number}. {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {items.length <= 6 ? (
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-xs">
              {items.map((it) => (
                <li key={it.id} className="truncate">
                  · {it.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {items.length} Arbeitspakete in der Auswahl.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
          >
            {submitting ? "Speichert…" : "Zuweisen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
