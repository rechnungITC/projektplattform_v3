"use client"

import { Loader2, Lock } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  governanceHistoryMessage,
  GOVERNANCE_HISTORY_BLOCK_CODE,
  type GovernanceHistoryBlock,
} from "@/lib/projects/governance-history"

interface HardDeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  onDeleted: () => void | Promise<void>
}

/**
 * PROJ-Y-148a — the dialog used to say three untrue things at once.
 *
 * 1. It promised "The project and its full lifecycle history will be removed".
 *    Since PROJ-130-β a hard delete writes `__deleted` rows into the
 *    append-only trail, so the history is precisely what does *not* go away.
 * 2. On the four trashed projects that carry governance history it surfaced the
 *    raw Postgres message — `stakeholder_profile_audit_events are
 *    append-only…` — as a red toast, i.e. an internal table name presented to
 *    a user as if the server had broken.
 * 3. It still called the shipped route "pending implementation" on a 404, an
 *    artefact from PROJ-2.
 *
 * It is now German (following PROJ-Y-143m) and asks the server *before*
 * offering the button, so a project that cannot be permanently deleted says so
 * instead of failing afterwards.
 */

type CheckState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "deletable" }
  | { state: "blocked"; message: string }
  /** Pre-flight itself failed — the server stays the authority, so we let the
   *  attempt happen rather than claim either outcome. */
  | { state: "unknown" }

export function HardDeleteConfirmDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onDeleted,
}: HardDeleteConfirmDialogProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState("")
  const [check, setCheck] = React.useState<CheckState>({ state: "idle" })

  React.useEffect(() => {
    if (!open) {
      setConfirmText("")
      setCheck({ state: "idle" })
      return
    }

    let cancelled = false
    setCheck({ state: "loading" })

    void (async () => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}?hard_delete_check=true`
        )
        if (cancelled) return

        if (!response.ok) {
          setCheck({ state: "unknown" })
          return
        }

        const data = (await response.json()) as {
          hard_delete_block?: GovernanceHistoryBlock | null
        }
        if (cancelled) return

        setCheck(
          data.hard_delete_block
            ? {
                state: "blocked",
                message: governanceHistoryMessage(data.hard_delete_block),
              }
            : { state: "deletable" }
        )
      } catch {
        if (!cancelled) setCheck({ state: "unknown" })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const blocked = check.state === "blocked"
  const canDelete =
    confirmText === projectName &&
    !submitting &&
    !blocked &&
    check.state !== "loading"

  const handleConfirm = async () => {
    if (!canDelete) return
    setSubmitting(true)
    try {
      const response = await fetch(`/api/projects/${projectId}?hard=true`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const { code, message } = await safeReadError(response)

        // The refusal is not an error to shout about — it is the answer.
        // Render it where the pre-flight would have shown it, so a delete that
        // becomes impossible between opening the dialog and confirming reads
        // the same as one that was impossible from the start.
        if (code === GOVERNANCE_HISTORY_BLOCK_CODE) {
          setCheck({ state: "blocked", message })
          setSubmitting(false)
          return
        }

        toast.error("Endgültiges Löschen nicht möglich", {
          description: translateDeleteError(code, message),
        })
        setSubmitting(false)
        return
      }

      toast.success("Projekt endgültig gelöscht", {
        description: `${projectName} wurde entfernt.`,
      })
      await onDeleted()
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unerwarteter Fehler"
      toast.error("Endgültiges Löschen nicht möglich", { description: message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blocked
              ? "Projekt bleibt im Papierkorb"
              : "Projekt endgültig löschen?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {blocked
              ? "Dieses Projekt lässt sich nicht endgültig löschen."
              : // Says what actually happens: the project and its contents go,
                // the record of the deletion stays in the change log.
                "Diese Aktion kann nicht rückgängig gemacht werden. Das Projekt " +
                "und seine Inhalte werden entfernt; der Löschvorgang selbst " +
                "bleibt im Änderungsprotokoll nachvollziehbar."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blocked ? (
          // Same three principles as ModuleUnavailableNotice (PROJ-Y-143f):
          // not an error — nothing broke; not an empty state — there is
          // something here, it just may not be removed; and no destructive
          // colour for a situation the user cannot and need not fix.
          <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4">
            <Lock
              className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">{check.message}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="hard-delete-confirm-input" className="text-sm">
              Zur Bestätigung <strong>{projectName}</strong> eingeben:
            </Label>
            <Input
              id="hard-delete-confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={submitting || check.state === "loading"}
              autoComplete="off"
            />
            {check.state === "loading" ? (
              <p className="text-xs text-muted-foreground">
                Projekt wird geprüft …
              </p>
            ) : null}
            {check.state === "unknown" ? (
              <p className="text-xs text-muted-foreground">
                Die Vorabprüfung war nicht möglich. Das Löschen wird trotzdem
                geprüft, sobald du bestätigst.
              </p>
            ) : null}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            {blocked ? "Schließen" : "Abbrechen"}
          </AlertDialogCancel>
          {blocked ? null : (
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirm()
              }}
              disabled={!canDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Endgültig löschen
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Turns the stable error `code` into German prose.
 *
 * `delete_failed` deliberately drops the server text: that field carries the
 * raw Postgres message, and putting internals in front of a user is the very
 * thing this slice set out to stop. Unknown codes fall back to the message,
 * which for our own routes is always our own wording.
 */
export function translateDeleteError(
  code: string | null,
  message: string
): string {
  switch (code) {
    case "not_found":
      return "Das Projekt existiert nicht mehr — möglicherweise hat es jemand anderes bereits gelöscht."
    case "forbidden":
      return "Nur Administratoren des Arbeitsbereichs dürfen Projekte endgültig löschen."
    case "server_misconfigured":
      return "Der Server ist für diesen Vorgang nicht vollständig konfiguriert. Bitte wende dich an den Support."
    case "delete_failed":
      return "Das Projekt konnte nicht gelöscht werden. Bitte versuche es erneut oder wende dich an den Support."
    default:
      return message
  }
}

/**
 * Reads the standard `{ error: { code, message } }` envelope. The `code` is the
 * contract the UI branches on — never the message text, which is prose and may
 * be reworded at any time (the PROJ-77-α lesson, where a 409 was recognised by
 * a message fragment).
 */
async function safeReadError(
  response: Response
): Promise<{ code: string | null; message: string }> {
  const fallback = `Anfrage fehlgeschlagen (${response.status})`
  try {
    const data = (await response.json()) as {
      error?: string | { code?: string; message?: string }
      message?: string
    }
    if (typeof data.error === "string") {
      return { code: null, message: data.error }
    }
    if (data.error && typeof data.error === "object") {
      return {
        code: data.error.code ?? null,
        message: data.error.message ?? fallback,
      }
    }
    return { code: null, message: data.message ?? fallback }
  } catch {
    return { code: null, message: fallback }
  }
}
