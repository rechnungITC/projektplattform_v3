"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
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
import {
  diffFrontmatter,
  hasAllowedActionsChange,
  hasFrontmatterChanges,
} from "@/lib/skills/frontmatter-diff"
import type { SkillFrontmatter } from "@/types/skill"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Version number of the target (archived) version, for labelling. */
  targetVersionNumber: number | null
  /** Current active version content (diff `prev`). */
  activeContent: string
  /** Target archived version content (diff `next` — what rollback restores). */
  targetContent: string
  /** PROJ-141-β2 (M-8) — active frontmatter to compare against target. */
  activeFrontmatter: SkillFrontmatter | null | undefined
  /** PROJ-141-β2 (M-8) — target frontmatter (rollback would restore this). */
  targetFrontmatter: SkillFrontmatter | null | undefined
  onConfirm: () => void
  busy: boolean
}

/**
 * PROJ-77-α — confirmation dialog for rolling back to an archived version.
 * Shows a dependency-free line diff (added / removed / unchanged) between the
 * current active content and the target archived version so the admin sees
 * exactly what a rollback would change before confirming.
 *
 * PROJ-141-β2 (M-8) — additionally shows a structured per-field frontmatter
 * sub-diff (allowed_actions / allowed_kinds / temperature / tone /
 * model_overrides), because `rollback_skill_version` restores both body AND
 * frontmatter. A body-only diff missed action-mandate changes silently.
 */
export function SkillRollbackDiffDialog({
  open,
  onOpenChange,
  targetVersionNumber,
  activeContent,
  targetContent,
  activeFrontmatter,
  targetFrontmatter,
  onConfirm,
  busy,
}: Props) {
  const lines = React.useMemo(
    () => lineDiff(activeContent, targetContent),
    [activeContent, targetContent]
  )
  const stats = React.useMemo(() => diffStats(lines), [lines])
  const bodyHasChanges = stats.added > 0 || stats.removed > 0

  const frontmatterDiffs = React.useMemo(
    () => diffFrontmatter(activeFrontmatter, targetFrontmatter),
    [activeFrontmatter, targetFrontmatter]
  )
  const frontmatterHasChanges = hasFrontmatterChanges(frontmatterDiffs)
  const actionMandateChanged = hasAllowedActionsChange(frontmatterDiffs)

  // PROJ-141-β2: "Keine Änderungen" only when BODY and FRONTMATTER are both clean.
  const noChanges = !bodyHasChanges && !frontmatterHasChanges

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
            Unterschiede gegenüber der aktuellen aktiven Version — sowohl im
            Text als auch im Frontmatter.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {actionMandateChanged && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden
            />
            <div>
              <strong>Aktionsmandat wird geändert:</strong>{" "}
              <span>
                Der Rollback verändert <code>allowed_actions</code>. Prüfe die
                Auswirkung, bevor du bestätigst.
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Body
            </h4>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="text-emerald-600 dark:text-emerald-400">
                +{stats.added}
              </span>
              <span className="text-destructive">−{stats.removed}</span>
              <span className="text-muted-foreground">
                {stats.unchanged} unverändert
              </span>
            </div>

            {bodyHasChanges ? (
              <pre className="mt-2 max-h-[16rem] overflow-x-auto overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
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
              <p className="mt-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Body identisch mit der aktuellen aktiven Version.
              </p>
            )}
          </div>

          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Frontmatter
            </h4>
            {frontmatterHasChanges ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <dl className="space-y-2">
                  {frontmatterDiffs
                    .filter((d) => d.changed)
                    .map((d) => (
                      <div key={d.key}>
                        <dt className="mb-0.5 font-medium">{d.label}</dt>
                        <dd className="flex flex-col gap-0.5 pl-3 font-mono">
                          {d.removed.map((item, i) => (
                            <span
                              key={`r-${d.key}-${i}`}
                              className="text-destructive"
                            >
                              − {item}
                            </span>
                          ))}
                          {d.added.map((item, i) => (
                            <span
                              key={`a-${d.key}-${i}`}
                              className="text-emerald-600 dark:text-emerald-400"
                            >
                              + {item}
                            </span>
                          ))}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ) : (
              <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Frontmatter identisch mit der aktuellen aktiven Version.
              </p>
            )}
          </div>

          {noChanges && (
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              Keine Änderungen – Body und Frontmatter sind identisch mit der
              aktuellen aktiven Version.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
          <Button type="button" disabled={busy} onClick={onConfirm}>
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
