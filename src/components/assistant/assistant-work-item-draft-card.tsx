"use client"

import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type {
  AssistantWorkItemDraftRow,
  ConfirmedWorkItem,
} from "@/hooks/use-assistant-work-item-drafts"
import {
  WORK_ITEM_DESCRIPTION_MAX,
  WORK_ITEM_TITLE_MAX,
} from "@/lib/assistant/work-item-command"
import type { AssistantWorkItemDraftRef } from "@/lib/assistant/types"
import { WORK_ITEM_KIND_LABELS, type WorkItemKind } from "@/types/work-item"

/**
 * PROJ-144 — Prüfansicht eines Sprach-Entwurfs (AC-144.15/144.16).
 *
 * Vor der Bestätigung existiert **kein** Work-Item. Erst der Klick auf
 * „Anlegen" schreibt; ein gesprochenes „ja" ist ausdrücklich kein Auslöser.
 *
 * WICHTIG für Aufrufer: diese Komponente hält Titel und Beschreibung in
 * lokalem State, der aus den Props **initialisiert** wird. Sie muss deshalb
 * mit `key={draft.id}` gerendert werden, damit ein anderer Entwurf einen
 * frischen Mount bekommt. Ein Reset per Effect wäre eine
 * set-state-in-effect-Verletzung des React-Compilers (Lehre aus PROJ-70-β).
 */

interface AssistantWorkItemDraftCardProps {
  draft: AssistantWorkItemDraftRef | AssistantWorkItemDraftRow
  /** Projektname mit anzeigen — in der Entwurfsliste nützlich, direkt nach dem Diktat redundant. */
  showProject?: boolean
  confirm: (
    draftId: string,
    patch: { title: string; description: string | null },
  ) => Promise<ConfirmedWorkItem>
  discard: (draftId: string) => Promise<void>
  onConfirmed: (workItem: ConfirmedWorkItem) => void
  onDiscarded: (draftId: string) => void
}

function kindLabel(kind: string): string {
  return WORK_ITEM_KIND_LABELS[kind as WorkItemKind] ?? kind
}

export function AssistantWorkItemDraftCard({
  draft,
  showProject = false,
  confirm,
  discard,
  onConfirmed,
  onDiscarded,
}: AssistantWorkItemDraftCardProps) {
  const [title, setTitle] = React.useState(draft.title)
  const [description, setDescription] = React.useState(draft.description ?? "")
  const [busy, setBusy] = React.useState<"confirm" | "discard" | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const trimmedTitle = title.trim()
  const titleInvalid = trimmedTitle.length === 0
  const titleId = `draft-title-${draft.id}`
  const descriptionId = `draft-description-${draft.id}`

  async function handleConfirm() {
    if (titleInvalid || busy) return
    setBusy("confirm")
    setError(null)
    try {
      const workItem = await confirm(draft.id, {
        title: trimmedTitle,
        description: description.trim() ? description : null,
      })
      onConfirmed(workItem)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anlage fehlgeschlagen")
    } finally {
      // Immer zurücksetzen, auch im Fehlerfall: der Nutzer soll nach einer
      // Korrektur erneut bestätigen können (die Route gibt den Entwurf bei
      // einem Fehlschlag wieder frei).
      setBusy(null)
    }
  }

  async function handleDiscard() {
    if (busy) return
    setBusy("discard")
    setError(null)
    try {
      await discard(draft.id)
      onDiscarded(draft.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwerfen fehlgeschlagen")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{kindLabel(draft.target_kind)}</Badge>
        <span className="text-xs text-muted-foreground">
          Entwurf — noch nicht angelegt
        </span>
      </div>

      {showProject && draft.project_name ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Projekt: {draft.project_name}
        </p>
      ) : null}

      {/* AC-144.8: die Methode hat eine andere Art erzwungen — das wird erklärt,
          nicht stillschweigend ersetzt. */}
      {draft.kind_was_mapped && draft.requested_kind ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500"
            aria-hidden
          />
          <span>
            Du hast „{kindLabel(draft.requested_kind)}“ gesagt — die Methode
            dieses Projekts kennt dafür{" "}
            <strong className="font-medium">
              {kindLabel(draft.target_kind)}
            </strong>
            .
          </span>
        </p>
      ) : null}

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={titleId} className="text-xs">
          Titel
        </Label>
        <Input
          id={titleId}
          value={title}
          maxLength={WORK_ITEM_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={titleInvalid}
          disabled={busy !== null}
        />
        {titleInvalid ? (
          <p className="text-xs text-destructive">
            Ohne Titel kann nichts angelegt werden.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Korrigierbar — die Spracherkennung hört Fachbegriffe nicht immer
            richtig.
          </p>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={descriptionId} className="text-xs">
          Beschreibung (optional)
        </Label>
        <Textarea
          id={descriptionId}
          value={description}
          rows={2}
          maxLength={WORK_ITEM_DESCRIPTION_MAX}
          className="resize-none"
          onChange={(event) => setDescription(event.target.value)}
          disabled={busy !== null}
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleConfirm()}
          disabled={titleInvalid || busy !== null}
        >
          {busy === "confirm" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="mr-2 h-4 w-4" aria-hidden />
          )}
          {kindLabel(draft.target_kind)} anlegen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void handleDiscard()}
          disabled={busy !== null}
        >
          {busy === "discard" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          )}
          Verwerfen
        </Button>
      </div>
    </div>
  )
}
