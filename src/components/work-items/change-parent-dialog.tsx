"use client"

import { ChevronRight, Loader2 } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useWorkItems } from "@/hooks/use-work-items"
import {
  isAllowedParent,
  WORK_ITEM_KIND_LABELS,
  type WorkItemWithProfile,
} from "@/types/work-item"

import { WorkItemKindBadge } from "./work-item-kind-badge"

const NO_PARENT_VALUE = "__none__"

interface ChangeParentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  onChanged: () => void | Promise<void>
}

export function ChangeParentDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onChanged,
}: ChangeParentDialogProps) {
  const { items: candidates } = useWorkItems(projectId)
  const [submitting, setSubmitting] = React.useState(false)
  const [selectedParentId, setSelectedParentId] = React.useState<string | null>(
    item.parent_id
  )

  React.useEffect(() => {
    if (open) {
      setSelectedParentId(item.parent_id)
    }
  }, [open, item.parent_id])

  const allowedParents = React.useMemo<WorkItemWithProfile[]>(() => {
    return candidates.filter(
      (p) => p.id !== item.id && isAllowedParent(item.kind, p.kind)
    )
  }, [candidates, item])
  const allowsTopLevel = isAllowedParent(item.kind, null)

  const previewParent =
    selectedParentId !== null
      ? candidates.find((p) => p.id === selectedParentId) ?? null
      : null

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}/parent`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent_id: selectedParentId }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/work-items/[wid]/parent ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Übergeordnetes Element konnte nicht geändert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }

      toast.success("Übergeordnet geändert")
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Übergeordnetes Element konnte nicht geändert werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Übergeordnet ändern</DialogTitle>
          <DialogDescription>
            Erlaubte Eltern für{" "}
            <strong>{WORK_ITEM_KIND_LABELS[item.kind]}</strong> werden
            automatisch gefiltert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="parent-select">Neues übergeordnetes Element</Label>
            <Select
              value={selectedParentId ?? NO_PARENT_VALUE}
              onValueChange={(v) =>
                setSelectedParentId(v === NO_PARENT_VALUE ? null : v)
              }
              disabled={submitting}
            >
              <SelectTrigger id="parent-select">
                <SelectValue placeholder="Wählen" />
              </SelectTrigger>
              <SelectContent>
                {allowsTopLevel ? (
                  <SelectItem value={NO_PARENT_VALUE}>(Top-Level)</SelectItem>
                ) : null}
                {allowedParents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {WORK_ITEM_KIND_LABELS[p.kind]}: {p.title}
                  </SelectItem>
                ))}
                {allowedParents.length === 0 && !allowsTopLevel ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Keine erlaubten Eltern verfügbar.
                  </div>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <span className="text-xs text-muted-foreground">Vorschau</span>
            <div className="mt-1 flex items-center gap-2 break-words">
              {previewParent ? (
                <>
                  <WorkItemKindBadge kind={previewParent.kind} iconOnly />
                  <span className="truncate">{previewParent.title}</span>
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </>
              ) : (
                <span className="text-muted-foreground">(Top-Level)</span>
              )}
              <WorkItemKindBadge kind={item.kind} iconOnly />
              <span className="truncate font-medium">{item.title}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
