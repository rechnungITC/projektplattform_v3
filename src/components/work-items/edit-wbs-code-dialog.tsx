"use client"

import { Loader2, RotateCcw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import type { WorkItemWithProfile } from "@/types/work-item"

/** PROJ-36 Phase 36-α — WBS-Code regex (mirrors DB CHECK + API PATCH). */
export const WBS_CODE_REGEX = /^[A-Za-z0-9._-]{1,50}$/

interface EditWbsCodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  item: WorkItemWithProfile
  onSaved: () => void | Promise<void>
}

/**
 * PROJ-36 Phase 36-γ — manual WBS-Code override + reset-to-auto dialog.
 *
 * Two paths:
 *   1. Save with new code → PATCH `wbs_code` (regex-validated). Backend
 *      forces `wbs_code_is_custom = true`.
 *   2. Reset-to-auto → PATCH `wbs_code_is_custom: false`. Backend nulls
 *      `wbs_code`; the autogen trigger regenerates from `outline_path`.
 */
export function EditWbsCodeDialog({
  open,
  onOpenChange,
  projectId,
  item,
  onSaved,
}: EditWbsCodeDialogProps) {
  const [draft, setDraft] = React.useState<string>(item.wbs_code ?? "")
  const [submitting, setSubmitting] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [confirmingReset, setConfirmingReset] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      // Sync external prop into local draft when dialog re-opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(item.wbs_code ?? "")
      setConfirmingReset(false)
    }
  }, [open, item.wbs_code])

  const isCustom = item.wbs_code_is_custom === true
  const trimmed = draft.trim()
  const validFormat = trimmed === "" ? false : WBS_CODE_REGEX.test(trimmed)
  const dirty = trimmed !== (item.wbs_code ?? "")
  const canSave = dirty && validFormat && !submitting && !resetting

  const handleSave = async () => {
    if (!canSave) return
    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wbs_code: trimmed }),
        }
      )
      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("WBS-Code konnte nicht gespeichert werden", {
          description: message,
        })
        setSubmitting(false)
        return
      }
      toast.success(`WBS-Code „${trimmed}" gespeichert`)
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("WBS-Code konnte nicht gespeichert werden", {
        description: message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetClick = () => {
    if (!isCustom) return
    setConfirmingReset(true)
  }

  const handleConfirmReset = async () => {
    setResetting(true)
    try {
      const response = await fetch(
        `/api/projects/${projectId}/work-items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wbs_code_is_custom: false }),
        }
      )
      if (!response.ok) {
        const message = await safeReadError(response)
        toast.error("Reset fehlgeschlagen", { description: message })
        setResetting(false)
        return
      }
      toast.success("WBS-Code wurde auf Auto zurückgesetzt")
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Reset fehlgeschlagen", { description: message })
    } finally {
      setResetting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>WBS-Code bearbeiten</DialogTitle>
          <DialogDescription>
            {isCustom ? (
              <>
                Aktueller Code: <strong>{item.wbs_code}</strong> (manuell
                überschrieben).
              </>
            ) : (
              <>
                Aktueller Code: <strong>{item.wbs_code ?? "—"}</strong>{" "}
                (automatisch generiert).
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {confirmingReset ? (
          <Alert>
            <AlertDescription>
              Code wird von „<strong>{item.wbs_code ?? "?"}</strong>&ldquo; auf
              den automatisch generierten Wert zurückgesetzt. Fortfahren?
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="wbs-code-input">Neuer Code</Label>
            <Input
              id="wbs-code-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="z. B. AP-001"
              maxLength={50}
              autoFocus
              disabled={submitting || resetting}
              aria-invalid={trimmed !== "" && !validFormat}
              aria-describedby="wbs-code-help"
            />
            <p
              id="wbs-code-help"
              className="text-xs text-muted-foreground"
            >
              Erlaubt: A-Z, 0-9, Punkt, Bindestrich, Unterstrich. Max 50 Zeichen.
            </p>
            {trimmed !== "" && !validFormat ? (
              <p className="text-xs text-destructive" role="alert">
                Ungültiges Format.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div>
            {isCustom && !confirmingReset ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetClick}
                disabled={submitting || resetting}
                aria-label="Auf Auto zurücksetzen"
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
                Auf Auto zurücksetzen
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (confirmingReset) {
                  setConfirmingReset(false)
                  return
                }
                onOpenChange(false)
              }}
              disabled={submitting || resetting}
            >
              {confirmingReset ? "Zurück" : "Abbrechen"}
            </Button>
            {confirmingReset ? (
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmReset}
                disabled={resetting}
              >
                {resetting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Zurücksetzen
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Speichern
              </Button>
            )}
          </div>
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
