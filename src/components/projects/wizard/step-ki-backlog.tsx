"use client"

/**
 * PROJ-70-ε — Wizard step "KI-Backlog" (optional, AC-ε1).
 *
 * The user uploads a kickoff artefact (same formats as 70-δ) BEFORE the
 * project exists. The file is sent through the existing γ/δ multipart
 * route WITHOUT a project_id (`context_sources.project_id` is nullable);
 * the resulting `context_source_id` + filename are stored in the draft's
 * `ki_backlog` JSON block. After finalize, the backend attaches the
 * source to the new project and the user is handed off to the Backlog
 * review drawer (Post-Finalize-Handoff, Lock-Q1).
 *
 * Upload happens IMMEDIATELY on file pick (Lock-Q3) so parse errors
 * surface right here with a retry, not after finalize. Skipping is
 * explicit — the step is optional and never blocks "Weiter".
 */

import * as React from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { uploadContextSourceFile } from "@/lib/ai-proposals/proposal-from-context-api"
import type { WizardData } from "@/types/wizard"

interface StepKiBacklogProps {
  /** Reserved for symmetry with other steps; the upload route resolves
   *  the active tenant server-side. */
  tenantId: string
}

/** Map a picked file to a context_sources.kind, mirroring the δ tab. */
function inferKind(file: File): string {
  const n = file.name.toLowerCase()
  if (n.endsWith(".eml") || n.endsWith(".msg")) return "email"
  if (n.endsWith(".md")) return "meeting_notes"
  return "document"
}

export function StepKiBacklog(_props: StepKiBacklogProps) {
  const form = useFormContext<WizardData>()
  // PROJ-67 AC-4 — `useWatch` is memoisation-safe (unlike `form.watch`).
  const ki = useWatch({ control: form.control, name: "ki_backlog" })
  const projectName = useWatch({ control: form.control, name: "name" })
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [lastFile, setLastFile] = React.useState<File | null>(null)

  const doUpload = React.useCallback(
    async (file: File) => {
      setBusy(true)
      setErrorMsg(null)
      setLastFile(file)
      try {
        const source = await uploadContextSourceFile({
          file,
          kind: inferKind(file),
          title: projectName?.trim()
            ? `Kickoff: ${projectName.trim()}`
            : file.name,
        })
        form.setValue(
          "ki_backlog",
          {
            enabled: true,
            context_source_id: source.id,
            filename: file.name,
          },
          { shouldDirty: true },
        )
        toast.success("Datei hochgeladen", {
          description: `${file.name} ist bereit für die KI-Generierung.`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler"
        setErrorMsg(message)
        toast.error("Upload fehlgeschlagen", { description: message })
      } finally {
        setBusy(false)
      }
    },
    [form, projectName],
  )

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void doUpload(file)
    // reset the input so re-picking the same filename re-triggers change
    e.target.value = ""
  }

  const onClear = () => {
    form.setValue(
      "ki_backlog",
      { enabled: true, context_source_id: null, filename: null },
      { shouldDirty: true },
    )
    setErrorMsg(null)
    setLastFile(null)
  }

  const uploaded = Boolean(ki?.context_source_id)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-sky-400/30 bg-sky-500/5 p-3 text-sm text-sky-800 dark:text-sky-200">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden />
        <p>
          Lade ein Kickoff-Dokument hoch — die KI schlägt nach dem Anlegen
          eine methodenadäquate Backlog-Hierarchie vor, die du reviewen,
          per Drag&amp;Drop umsortieren und einzeln oder gesammelt
          übernehmen kannst. Du kannst diesen Schritt auch{" "}
          <strong>überspringen</strong> und das Backlog später erzeugen.
        </p>
      </div>

      {!uploaded && (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed bg-muted/10 p-6 text-center">
          <Upload className="h-7 w-7 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium">Kickoff-Datei auswählen</p>
            <p className="text-[11px] text-muted-foreground">
              PDF · DOCX · TXT · MD · EML · MSG · max 25 MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.eml,.msg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,message/rfc822,application/vnd.ms-outlook"
            className="hidden"
            onChange={onPick}
            disabled={busy}
            data-testid="wizard-ki-backlog-file-input"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            data-testid="wizard-ki-backlog-pick"
          >
            {busy ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                Lädt &amp; analysiert …
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Datei auswählen
              </>
            )}
          </Button>
        </div>
      )}

      {uploaded && (
        <div
          className="flex items-center justify-between gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/5 p-3"
          data-testid="wizard-ki-backlog-uploaded"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300"
              aria-hidden
            />
            <span className="truncate">
              {ki?.filename ?? "Datei hochgeladen"}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={busy}
          >
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Andere Datei
          </Button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{errorMsg}</span>
          </span>
          {lastFile && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void doUpload(lastFile)}
              disabled={busy}
            >
              Erneut versuchen
            </Button>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Hinweis: Class-3-Inhalte (personenbezogene Daten) werden serverseitig
        erkannt und ausschließlich an ein mandanteneigenes lokales Modell
        geleitet — nie an ein externes Cloud-Modell.
      </p>
    </div>
  )
}
