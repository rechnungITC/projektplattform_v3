"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { diffStats, lineDiff } from "@/lib/skills/diff"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Version number of the target (archived) version, for labelling. */
  targetVersionNumber: number | null
  /** Current active version content (diff `prev`). */
  activeContent: string
  /** Target archived version content (diff `next` — what rollback restores). */
  targetContent: string
  onConfirm: () => void
  busy: boolean
}

/**
 * PROJ-77-α — confirmation dialog for rolling back to an archived version.
 * Shows a dependency-free line diff (added / removed / unchanged) between the
 * current active content and the target archived version so the admin sees
 * exactly what a rollback would change before confirming.
 */
export function SkillRollbackDiffDialog({
  open,
  onOpenChange,
  targetVersionNumber,
  activeContent,
  targetContent,
  onConfirm,
  busy,
}: Props) {
  const lines = React.useMemo(
    () => lineDiff(activeContent, targetContent),
    [activeContent, targetContent]
  )
  const stats = React.useMemo(() => diffStats(lines), [lines])
  const hasChanges = stats.added > 0 || stats.removed > 0

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {targetVersionNumber != null
              ? `Auf v${targetVersionNumber} zurückrollen?`
              : "Zurückrollen?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Beim Zurückrollen wird eine neue aktive Version mit dem Inhalt der
            gewählten Version erstellt. Die folgende Vorschau zeigt die
            Unterschiede gegenüber der aktuellen aktiven Version.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{stats.added}
            </span>
            <span className="text-destructive">−{stats.removed}</span>
            <span className="text-muted-foreground">
              {stats.unchanged} unverändert
            </span>
          </div>

          {hasChanges ? (
            <pre className="max-h-[24rem] overflow-x-auto overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {lines.map((line, i) => {
                const prefix =
                  line.op === "added"
                    ? "+"
                    : line.op === "removed"
                      ? "−"
                      : " "
                const cls =
                  line.op === "added"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : line.op === "removed"
                      ? "text-destructive"
                      : "text-muted-foreground"
                return (
                  <div key={i} className={cls}>
                    {`${prefix} ${line.value}`}
                  </div>
                )
              })}
            </pre>
          ) : (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              Keine Änderungen – der Inhalt ist identisch mit der aktuellen
              aktiven Version.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
          <Button
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            )}
            Zurückrollen
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
