"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
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
import { useAuth } from "@/hooks/use-auth"
import { kindsForMethod } from "@/lib/work-items/method-context"
import type { ProjectMethod } from "@/types/project-method"
import {
  WORK_ITEM_KIND_LABELS,
  type WorkItemKind,
  type WorkItemWithProfile,
} from "@/types/work-item"

interface ChangeKindDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  method: ProjectMethod | null
  onChanged: () => void | Promise<void>
}

/**
 * Admin-only — kind change can break parent links. The backend re-runs
 * `validate_work_item_parent` against the new kind and either accepts
 * or rejects with 422.
 */
export function ChangeKindDialog({
  open,
  onOpenChange,
  projectId,
  item,
  method,
  onChanged,
}: ChangeKindDialogProps) {
  const { currentRole } = useAuth()
  const isAdmin = currentRole === "admin"

  const [submitting, setSubmitting] = React.useState(false)
  const [selectedKind, setSelectedKind] = React.useState<WorkItemKind>(item.kind)

  React.useEffect(() => {
    if (open) {
      setSelectedKind(item.kind)
    }
  }, [open, item.kind])

  const availableKinds = React.useMemo(() => kindsForMethod(method), [method])

  const onSubmit = async () => {
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: selectedKind }),
        }
      )

      if (response.status === 404) {
        toast.warning("Endpoint kommt mit /backend", {
          description:
            "PATCH /api/projects/[id]/work-items/[wid] ist noch nicht implementiert.",
        })
        setSubmitting(false)
        return
      }

      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Typ konnte nicht geändert werden", { description: message })
        setSubmitting(false)
        return
      }

      toast.success("Typ geändert", {
        description: `${item.title} ist jetzt ${WORK_ITEM_KIND_LABELS[selectedKind]}.`,
      })
      await onChanged()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Typ konnte nicht geändert werden", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Typ ändern</DialogTitle>
            <DialogDescription>
              Diese Aktion ist nur für Admins verfügbar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Typ ändern (Admin)</DialogTitle>
          <DialogDescription>
            Aktuell: <strong>{WORK_ITEM_KIND_LABELS[item.kind]}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Kind-Wechsel kann Eltern-Verknüpfungen brechen. Der Server
              validiert das Ergebnis und lehnt unzulässige Kombinationen mit
              422 ab.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="kind-select">Neuer Typ</Label>
          <Select
            value={selectedKind}
            onValueChange={(v) => setSelectedKind(v as WorkItemKind)}
            disabled={submitting}
          >
            <SelectTrigger id="kind-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableKinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {WORK_ITEM_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button
            type="button"
            onClick={onSubmit}
            disabled={submitting || selectedKind === item.kind}
          >
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
