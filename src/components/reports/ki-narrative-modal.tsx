"use client"

import { Loader2, Sparkles } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useSnapshotPreviewKi } from "@/hooks/use-snapshot-preview-ki"
import type {
  CreateSnapshotRequest,
  SnapshotKind,
} from "@/lib/reports/types"
import { SNAPSHOT_KIND_LABELS } from "@/lib/reports/types"

interface KiNarrativeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  kind: SnapshotKind
  onCommit: (body: CreateSnapshotRequest) => Promise<void>
}

const TEXTAREA_MAX = 1000

/**
 * KI-Narrative-Preview-Modal (PROJ-21 § ST-06). On open, requests a
 * preview from the configured provider. The user can edit the text
 * before saving — the saved snapshot stores the FINAL (possibly
 * edited) text in `content.ki_summary`.
 *
 * If the provider is offline / quota-exceeded / local-only-but-no-
 * local-provider, the user can still save with an empty narrative
 * (the snapshot is created without the KI section).
 */
export function KiNarrativeModal({
  open,
  onOpenChange,
  projectId,
  kind,
  onCommit,
}: KiNarrativeModalProps) {
  const previewState = useSnapshotPreviewKi(projectId)
  const [text, setText] = React.useState("")
  const [committing, setCommitting] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      previewState.reset()
      setText("")
      void (async () => {
        const result = await previewState.generate({ kind })
        if (result) setText(result.text)
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate identity stable per project
  }, [open, kind])

  const charsLeft = TEXTAREA_MAX - text.length
  const canCommit = !committing && !previewState.loading

  async function handleSave(includeText: boolean) {
    setCommitting(true)
    try {
      await onCommit({
        kind,
        ki_summary_text: includeText && text.trim() ? text.trim() : undefined,
      })
      onOpenChange(false)
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden />
            KI-Kurzfazit für {SNAPSHOT_KIND_LABELS[kind]}
          </DialogTitle>
          <DialogDescription>
            Eine 3-Sätze-Zusammenfassung „Wo stehen wir?&ldquo;. Du kannst
            den Text vor dem Speichern bearbeiten. Class-3-Daten werden
            ausschließlich an den lokalen Provider geschickt (PROJ-12).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {previewState.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Generiere Vorschlag …
            </div>
          ) : previewState.error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              KI-Provider nicht erreichbar: {previewState.error}. Du kannst den
              Snapshot trotzdem ohne KI-Block speichern oder den Text manuell
              eintragen.
            </p>
          ) : previewState.preview ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Quelle: <span className="font-mono">{previewState.preview.provider}</span>
              {" · "}Datenklasse {previewState.preview.classification}
            </p>
          ) : null}

          <div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, TEXTAREA_MAX))}
              rows={5}
              placeholder="Drei Sätze, die den Status zusammenfassen …"
              disabled={previewState.loading}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Hinweis: Der Text wird gespeichert wie eingegeben — bei Edits zu
              Class-3-Inhalten wird die Klassifikation NICHT erneut geprüft.
              Verbleibend: {charsLeft} Zeichen.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void handleSave(false)}
            disabled={!canCommit}
          >
            Ohne KI-Block speichern
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave(true)}
            disabled={!canCommit || text.trim().length === 0}
          >
            {committing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Snapshot speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
