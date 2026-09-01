"use client"

import {
  Bot,
  Loader2,
  Mic,
  MicOff,
  Navigation,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AssistantDialogControls } from "@/components/assistant/assistant-dialog-controls"
import { AssistantWorkItemDraftCard } from "@/components/assistant/assistant-work-item-draft-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import {
  useAssistantWorkItemDrafts,
  type ConfirmedWorkItem,
} from "@/hooks/use-assistant-work-item-drafts"
import { WORK_ITEM_DRAFT_RETENTION_DAYS } from "@/lib/assistant/work-item-command"
import type {
  AssistantContinuation,
  AssistantDialogState,
  ProjectDialogSlot,
} from "@/lib/assistant/dialog-state"
import { isModuleActive } from "@/lib/tenant-settings/modules"
import type {
  AssistantIntent,
  AssistantResultStatus,
  AssistantRouteTarget,
  AssistantWorkItemDraftRef,
} from "@/lib/assistant/types"

interface AssistantLauncherProps {
  currentProjectId: string | null
}

interface AssistantTurnResponse {
  session: {
    id: string
    transcript_retention_mode: string
  }
  result: {
    recognized_intent: AssistantIntent
    result_status: AssistantResultStatus
    user_response: string
    route_target: AssistantRouteTarget | null
    project_choices: Array<{
      id: string
      name: string
      lifecycle_status: string
    }>
    wizard_draft: { id: string; name: string | null; href: string } | null
    /** PROJ-144 — der Sprach-Entwurf aus Schritt 1; noch kein Work-Item. */
    work_item_draft: AssistantWorkItemDraftRef | null
    dialog_state: AssistantDialogState | null
  }
}

interface AssistantResumeResponse {
  session: { id: string }
  result: {
    dialog_state: AssistantDialogState | null
    project_choices: AssistantTurnResponse["result"]["project_choices"]
  }
}

interface AssistantMessage {
  id: string
  role: "user" | "assistant"
  text: string
  intent?: AssistantIntent
  status?: AssistantResultStatus
  routeTarget?: AssistantRouteTarget | null
  choices?: AssistantTurnResponse["result"]["project_choices"]
  draft?: AssistantTurnResponse["result"]["wizard_draft"]
  workItemDraft?: AssistantWorkItemDraftRef | null
  dialogState?: AssistantDialogState | null
}

/**
 * PROJ-144 — Sprung zum angelegten Work-Item (AC-144.20).
 *
 * Bewusst der **kanonische** Slug: die Methoden-Auflösung passiert in
 * `src/proxy.ts`, das bei abweichender Methode mit 308 auf den passenden Slug
 * umleitet (`/arbeitspakete` bei Wasserfall, PROJ-28). Hier die Methode selbst
 * nachzubilden wäre eine zweite Autorität für dieselbe Regel.
 */
function workItemHref(projectId: string): string {
  return `/projects/${projectId}/backlog`
}

function resumedDialogPrompt(state: AssistantDialogState): string {
  if (state.pending_intent === "project_create_draft") {
    if (state.phase === "reviewing") {
      return "Dein offener Projektentwurf ist wieder da. Bitte prüfe die Angaben."
    }
    if (state.requested_slot === "name") return "Wie soll das Projekt heißen?"
    if (state.requested_slot === "project_type") return "Welchen Projekttyp soll ich verwenden?"
    if (state.requested_slot === "project_method") return "Welche Projektmethode soll ich verwenden?"
    return "Wie möchtest du das Projekt kurz beschreiben?"
  }
  if (state.phase === "choosing_project") {
    return "Wähle das Projekt aus, in dem der Entwurf vorbereitet werden soll."
  }
  return state.requested_slot === "title"
    ? "Wie soll die Position heißen?"
    : "Welches Projekt meinst du?"
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
  isFinal?: boolean
}

interface SpeechRecognitionResultEventLike {
  results: {
    readonly length: number
    [index: number]: SpeechRecognitionResultLike
  }
  resultIndex?: number
}

type SpeechRecognitionErrorCode =
  | "aborted"
  | "audio-capture"
  | "bad-grammar"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "phrases-not-supported"
  | "service-not-allowed"

interface SpeechRecognitionErrorEventLike {
  error: SpeechRecognitionErrorCode
  message?: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

interface SpeechWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

export function AssistantLauncher({ currentProjectId }: AssistantLauncherProps) {
  const router = useRouter()
  const pathname = usePathname() ?? "/"
  const { currentTenant, tenantSettings, user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [dialogState, setDialogState] = React.useState<AssistantDialogState | null>(null)
  const [messages, setMessages] = React.useState<AssistantMessage[]>([])
  const [state, setState] = React.useState<
    "idle" | "listening" | "thinking" | "responding"
  >("idle")
  const [speechEnabled, setSpeechEnabled] = React.useState(false)
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const manualStopRef = React.useRef(false)
  const keepListeningRef = React.useRef(false)
  const inputRef = React.useRef("")
  const inputModalityRef = React.useRef<"text" | "voice">("text")
  const speechBaseRef = React.useRef("")
  const speechRestartTimerRef = React.useRef<number | null>(null)
  const completionKeysRef = React.useRef(new Map<number, string>())
  const sessionStorageKey = `assistant-session:${user.id}:${currentTenant?.id ?? "none"}`

  // PROJ-144 — Entwürfe, die in dieser Sitzung bestätigt oder verworfen wurden.
  // Ihre Karte verschwindet, damit nichts zweimal bestätigbar aussieht
  // (AC-144.19); die eigentliche Verbraucht-Sicherung liegt serverseitig.
  const [consumedDraftIds, setConsumedDraftIds] = React.useState<Set<string>>(
    () => new Set(),
  )
  // Die Liste wird nur geladen, wenn das Overlay offen ist (Lock L7).
  const drafts = useAssistantWorkItemDrafts(open)

  const assistantActive = isModuleActive(tenantSettings, "assistant")
  const ttsEnabled =
    tenantSettings?.assistant_settings?.tts_provider !== "none" &&
    speechEnabled

  const speechRecognitionSupported = React.useMemo(() => {
    if (typeof window === "undefined") return false
    const speechWindow = window as SpeechWindow
    return Boolean(
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition,
    )
  }, [])

  const speak = React.useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === "undefined") return
      if (!("speechSynthesis" in window)) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = "de-DE"
      window.speechSynthesis.speak(utterance)
    },
    [ttsEnabled],
  )

  const resumeSession = React.useCallback(
    async (
      storedSessionId: string,
      mode: "reload" | "conflict",
      signal?: AbortSignal,
    ) => {
      const response = await fetch(
        `/api/assistant/turns?session_id=${encodeURIComponent(storedSessionId)}`,
        { signal },
      )
      if (!response.ok) {
        sessionStorage.removeItem(sessionStorageKey)
        return false
      }
      const body = (await response.json()) as AssistantResumeResponse
      const resumedState = body.result.dialog_state
      if (!resumedState) {
        sessionStorage.removeItem(sessionStorageKey)
        setSessionId(null)
        setDialogState(null)
        return false
      }

      setSessionId(body.session.id)
      setDialogState(resumedState)
      sessionStorage.setItem(sessionStorageKey, body.session.id)
      const resumedMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text:
          mode === "conflict"
            ? "Der Dialog wurde in einem anderen Fenster geändert. Hier ist der aktuelle Stand."
            : resumedDialogPrompt(resumedState),
        intent: resumedState.pending_intent,
        status: "needs_clarification",
        choices: body.result.project_choices,
        dialogState: resumedState,
      }
      setMessages((prev) =>
        mode === "reload"
          ? [resumedMessage]
          : [
              ...prev.map((message) => ({ ...message, dialogState: null })),
              resumedMessage,
            ],
      )
      return true
    },
    [sessionStorageKey],
  )

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const storedSessionId = sessionStorage.getItem(sessionStorageKey)
    if (!storedSessionId) {
      queueMicrotask(() => {
        if (cancelled) return
        setSessionId(null)
        setDialogState(null)
        setMessages([])
      })
      return () => {
        cancelled = true
      }
    }
    queueMicrotask(() => {
      if (cancelled) return
      void resumeSession(storedSessionId, "reload", controller.signal).catch(
        (error) => {
          if (
            !cancelled &&
            !(error instanceof DOMException && error.name === "AbortError")
          ) {
            sessionStorage.removeItem(sessionStorageKey)
          }
        },
      )
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [resumeSession, sessionStorageKey])

  const submitTurn = React.useCallback(
    async (text: string, continuation: AssistantContinuation | null = null) => {
      const trimmed = text.trim()
      if ((!trimmed && !continuation) || state === "thinking") return
      const modality = continuation ? "text" : inputModalityRef.current
      if (trimmed) {
        const userMessage: AssistantMessage = {
          id: crypto.randomUUID(),
          role: "user",
          text: trimmed,
        }
        setMessages((prev) => [...prev, userMessage])
      }
      inputRef.current = ""
      inputModalityRef.current = "text"
      setInput("")
      setState("thinking")

      try {
        const response = await fetch("/api/assistant/turns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            input_text: trimmed,
            modality,
            project_id: currentProjectId,
            client_context_path: pathname,
            dialog_revision: continuation ? undefined : dialogState?.revision,
            continuation,
          }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { code?: string; message?: string } }
            | null
          if (body?.error?.code === "assistant_dialog_conflict") {
            if (sessionId && (await resumeSession(sessionId, "conflict"))) {
              toast.info("Dialogstand aktualisiert")
              return
            }
          }
          throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
        }
        const body = (await response.json()) as AssistantTurnResponse
        setSessionId(body.session.id)
        sessionStorage.setItem(sessionStorageKey, body.session.id)
        setDialogState(body.result.dialog_state)
        setState("responding")
        const assistantMessage: AssistantMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: body.result.user_response,
          intent: body.result.recognized_intent,
          status: body.result.result_status,
          routeTarget: body.result.route_target,
          choices: body.result.project_choices,
          draft: body.result.wizard_draft,
          workItemDraft: body.result.work_item_draft,
          dialogState: body.result.dialog_state,
        }
        setMessages((prev) => [
          ...prev.map((message) => ({ ...message, dialogState: null })),
          assistantMessage,
        ])
        // Der neue Entwurf liegt schon in der Datenbank — die Liste im Overlay
        // muss das mitbekommen, sonst zeigt sie einen veralteten Stand.
        if (body.result.work_item_draft) drafts.refresh()
        speak(body.result.user_response)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Assistant-Anfrage fehlgeschlagen"
        toast.error("Assistant nicht erreichbar", { description: message })
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: message,
            status: "failed",
          },
        ])
      } finally {
        setState("idle")
      }
    },
    [
      currentProjectId,
      dialogState,
      drafts,
      pathname,
      resumeSession,
      sessionId,
      sessionStorageKey,
      speak,
      state,
    ],
  )

  const submit = React.useCallback(
    (text: string) => submitTurn(text),
    [submitTurn],
  )

  const continueDialog = React.useCallback(
    (continuation: AssistantContinuation) => submitTurn("", continuation),
    [submitTurn],
  )

  const handleProjectChoice = React.useCallback(
    (projectId: string) => {
      if (!dialogState) return
      void continueDialog({
        kind: "project_choice",
        project_id: projectId,
        expected_revision: dialogState.revision,
      })
    },
    [continueDialog, dialogState],
  )

  const handleProjectApproval = React.useCallback(() => {
    if (!dialogState || dialogState.pending_intent !== "project_create_draft") return
    let completionKey = completionKeysRef.current.get(dialogState.revision)
    if (!completionKey) {
      completionKey = crypto.randomUUID()
      completionKeysRef.current.set(dialogState.revision, completionKey)
    }
    void continueDialog({
      kind: "approve_project",
      expected_revision: dialogState.revision,
      completion_key: completionKey,
    })
  }, [continueDialog, dialogState])

  const handleProjectCorrection = React.useCallback(
    (field: ProjectDialogSlot, value: string) => {
      if (!dialogState || dialogState.pending_intent !== "project_create_draft") return
      void continueDialog({
        kind: "correct_project_field",
        field,
        value,
        expected_revision: dialogState.revision,
      })
    },
    [continueDialog, dialogState],
  )

  const handleDialogCancel = React.useCallback(() => {
    if (!dialogState) return
    void continueDialog({
      kind: "cancel",
      expected_revision: dialogState.revision,
    })
  }, [continueDialog, dialogState])

  /**
   * PROJ-144 — nach der Anlage: Erfolg melden, Sprung anbieten, Overlay offen
   * lassen (Lock L6). Genau das erlaubt es, im Meeting mehrere Elemente in
   * Folge zu diktieren, ohne den Arbeitskontext zu verlassen.
   */
  const handleDraftConfirmed = React.useCallback(
    (draftId: string, workItem: ConfirmedWorkItem) => {
      setConsumedDraftIds((prev) => new Set(prev).add(draftId))
      const kind = workItem.kind
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `„${workItem.title}“ wurde angelegt.`,
          status: "success",
          routeTarget: {
            href: workItemHref(workItem.project_id),
            label: kind === "work_package" ? "Arbeitspakete öffnen" : "Backlog öffnen",
          },
        },
      ])
    },
    [],
  )

  const handleDraftDiscarded = React.useCallback((draftId: string) => {
    setConsumedDraftIds((prev) => new Set(prev).add(draftId))
  }, [])

  // Ein Entwurf, der direkt nach dem Diktat schon als Karte im Gesprächsverlauf
  // steht, soll nicht zusätzlich in der Liste auftauchen.
  const inlineDraftIds = React.useMemo(
    () =>
      new Set(
        messages
          .map((message) => message.workItemDraft?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [messages],
  )

  const startListening = React.useCallback(async () => {
    if (typeof window === "undefined") return
    const speechWindow = window as SpeechWindow
    const Ctor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Ctor) {
      toast.info("Spracherkennung nicht verfügbar")
      return
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        stream.getTracks().forEach((track) => track.stop())
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ""
        if (name === "NotAllowedError" || name === "SecurityError") {
          toast.error("Mikrofonzugriff blockiert", {
            description:
              "Bitte erlaube das Mikrofon im Browser oder nutze den Textmodus.",
          })
        } else if (name === "NotFoundError") {
          toast.error("Kein Mikrofon gefunden", {
            description: "Der Assistant bleibt im Textmodus nutzbar.",
          })
        } else {
          toast.error("Mikrofon nicht erreichbar", {
            description: "Der Assistant bleibt im Textmodus nutzbar.",
          })
        }
        setState("idle")
        return
      }
    }

    const recognition = new Ctor()
    recognition.lang = "de-DE"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    speechBaseRef.current = inputRef.current.trim()
    recognition.onresult = (event) => {
      const spokenSegments: string[] = []
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript.trim()
        if (transcript) spokenSegments.push(transcript)
      }
      const nextInput = [speechBaseRef.current, spokenSegments.join(" ")]
        .filter(Boolean)
        .join(" ")
      inputRef.current = nextInput
      inputModalityRef.current = "voice"
      setInput(nextInput)
    }
    recognition.onerror = (event) => {
      if (manualStopRef.current) return
      if (event.error === "no-speech") {
        // Chrome/Edge melden eine normale Sprechpause teils als `no-speech`
        // und lösen danach `onend` aus. Der Restart dort hält die Aufnahme
        // offen, bis der Nutzer sie ausdrücklich beendet.
        return
      } else if (event.error === "not-allowed") {
        toast.error("Mikrofonzugriff blockiert", {
          description:
            "Bitte erlaube das Mikrofon im Browser oder nutze den Textmodus.",
        })
      } else if (event.error === "audio-capture") {
        toast.error("Kein Mikrofon gefunden", {
          description: "Der Assistant bleibt im Textmodus nutzbar.",
        })
      } else if (
        event.error === "network" ||
        event.error === "service-not-allowed"
      ) {
        toast.error("Browser-Spracherkennung nicht verfügbar", {
          description: "Der Assistant bleibt im Textmodus nutzbar.",
        })
      } else if (event.error === "aborted") {
        toast.info("Spracherkennung beendet", {
          description: "Du kannst den Auftrag im Textfeld eingeben.",
        })
      } else {
        toast.error("Spracherkennung fehlgeschlagen", {
          description: event.message || "Der Textmodus bleibt verfügbar.",
        })
      }
      keepListeningRef.current = false
      setState("idle")
    }
    recognition.onend = () => {
      if (manualStopRef.current || !keepListeningRef.current) {
        recognitionRef.current = null
        manualStopRef.current = false
        setState("idle")
        return
      }

      // Web Speech darf trotz `continuous=true` nach einer Pause enden. Vor
      // dem Neustart wird das bisher Erkannte zur neuen Basis, damit die neue
      // Result-Liste den vorhandenen Text nicht überschreibt.
      speechBaseRef.current = inputRef.current.trim()
      speechRestartTimerRef.current = window.setTimeout(() => {
        speechRestartTimerRef.current = null
        if (!keepListeningRef.current) return
        try {
          recognition.start()
        } catch {
          keepListeningRef.current = false
          recognitionRef.current = null
          setState("idle")
          toast.error("Spracherkennung konnte nicht fortgesetzt werden", {
            description: "Der bereits erkannte Text bleibt im Eingabefeld.",
          })
        }
      }, 150)
    }
    recognitionRef.current = recognition
    manualStopRef.current = false
    keepListeningRef.current = true
    setState("listening")
    try {
      recognition.start()
    } catch {
      keepListeningRef.current = false
      recognitionRef.current = null
      setState("idle")
      toast.error("Spracherkennung konnte nicht starten", {
        description: "Bitte nutze den Textmodus oder versuche es erneut.",
      })
    }
  }, [])

  const stopListening = React.useCallback(() => {
    keepListeningRef.current = false
    manualStopRef.current = true
    if (speechRestartTimerRef.current !== null) {
      window.clearTimeout(speechRestartTimerRef.current)
      speechRestartTimerRef.current = null
    }
    const recognition = recognitionRef.current
    recognitionRef.current = null
    try {
      recognition?.stop()
    } catch {
      // Nach einem browserseitigen `onend` kann `stop()` während des kurzen
      // Restart-Fensters einen InvalidStateError werfen. Der Nutzer-Stop gilt
      // trotzdem und der erkannte Text bleibt erhalten.
    }
    setState("idle")
  }, [])

  React.useEffect(
    () => () => {
      keepListeningRef.current = false
      if (speechRestartTimerRef.current !== null) {
        window.clearTimeout(speechRestartTimerRef.current)
      }
      try {
        recognitionRef.current?.stop()
      } catch {
        // Die Browser-Recognition kann beim Unmount bereits beendet sein.
      }
    },
    [],
  )

  if (!assistantActive) return null

  const resumableDrafts = drafts.data.filter(
    (row) => !consumedDraftIds.has(row.id) && !inlineDraftIds.has(row.id),
  )

  const statusLabel =
    state === "listening"
      ? "Hört zu"
      : state === "thinking"
        ? "Verarbeitet"
        : state === "responding"
          ? "Antwortet"
          : "Bereit"

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              type="button"
              size="icon"
              className="fixed bottom-4 right-4 z-40 h-11 w-11 rounded-full shadow-lg"
              aria-label="Assistant öffnen"
            >
              <Bot className="h-5 w-5" aria-hidden />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Assistant</TooltipContent>
      </Tooltip>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <SheetTitle>Assistant</SheetTitle>
              <SheetDescription>{statusLabel}</SheetDescription>
            </div>
            <Badge variant={state === "idle" ? "secondary" : "default"}>
              {state}
            </Badge>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1 px-5 py-4">
          <div className="space-y-3">
            {/* PROJ-144 (Lock L7 / AC-144.17) — nicht bestätigte Entwürfe sind
                wiederaufnehmbar. Sie stehen im Overlay, nicht im Backlog: ein
                Entwurf ist ein Artefakt des Assistenten, kein Work-Item. */}
            {resumableDrafts.length > 0 ? (
              <section
                aria-label="Offene Sprach-Entwürfe"
                className="space-y-2 rounded-md border border-dashed p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Offene Entwürfe</p>
                  <Badge variant="outline">{resumableDrafts.length}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Diktiert, aber noch nicht angelegt. Wird nach{" "}
                  {WORK_ITEM_DRAFT_RETENTION_DAYS} Tagen automatisch entfernt.
                </p>
                {resumableDrafts.map((row) => (
                  <AssistantWorkItemDraftCard
                    key={row.id}
                    draft={row}
                    showProject
                    confirm={drafts.confirm}
                    discard={drafts.discard}
                    onConfirmed={(workItem) =>
                      handleDraftConfirmed(row.id, workItem)
                    }
                    onDiscarded={handleDraftDiscarded}
                  />
                ))}
              </section>
            ) : null}
            {drafts.error ? (
              <p className="text-xs text-muted-foreground">
                Entwürfe konnten nicht geladen werden: {drafts.error}
              </p>
            ) : null}
            {messages.length === 0 && resumableDrafts.length === 0 ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Keine Nachrichten
              </div>
            ) : null}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-8 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "mr-8 rounded-md border bg-background px-3 py-2 text-sm"
                }
              >
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.intent ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{message.intent}</Badge>
                    {message.status ? (
                      <Badge
                        variant={
                          message.status === "success"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {message.status}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                {message.choices && message.choices.length > 0 && !message.dialogState ? (
                  <div className="mt-3 space-y-2">
                    {message.choices.map((choice) => (
                      <Button
                        key={choice.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => router.push(`/projects/${choice.id}`)}
                      >
                        <Navigation className="mr-2 h-4 w-4" aria-hidden />
                        {choice.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {message.dialogState ? (
                  <AssistantDialogControls
                    dialogState={message.dialogState}
                    projectChoices={message.choices ?? []}
                    busy={state === "thinking"}
                    onProjectChoice={handleProjectChoice}
                    onApproveProject={handleProjectApproval}
                    onCorrectProjectField={handleProjectCorrection}
                    onCancel={handleDialogCancel}
                  />
                ) : null}
                {message.routeTarget ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => router.push(message.routeTarget!.href)}
                  >
                    <Navigation className="mr-2 h-4 w-4" aria-hidden />
                    {message.routeTarget.label}
                  </Button>
                ) : null}
                {/* PROJ-144 — die Prüfansicht direkt am Sprechfluss (Lock L2).
                    `key` gibt jedem Entwurf einen frischen Mount, damit die
                    Titel-Korrektur nicht aus einem Effect zurückgesetzt wird. */}
                {message.workItemDraft &&
                !consumedDraftIds.has(message.workItemDraft.id) ? (
                  <div className="mt-3">
                    <AssistantWorkItemDraftCard
                      key={message.workItemDraft.id}
                      draft={message.workItemDraft}
                      confirm={drafts.confirm}
                      discard={drafts.discard}
                      onConfirmed={(workItem) =>
                        handleDraftConfirmed(
                          message.workItemDraft!.id,
                          workItem,
                        )
                      }
                      onDiscarded={handleDraftDiscarded}
                    />
                  </div>
                ) : null}
              </div>
            ))}
            {state === "thinking" ? (
              <div className="mr-8 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Verarbeitet
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <Textarea
            value={input}
            onChange={(event) => {
              inputRef.current = event.target.value
              inputModalityRef.current = "text"
              setInput(event.target.value)
            }}
            placeholder="Assistant fragen"
            rows={3}
            className="resize-none"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                void submit(input)
              }
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!speechRecognitionSupported}
                    onClick={
                      state === "listening"
                        ? stopListening
                        : () => void startListening()
                    }
                    aria-label={
                      state === "listening"
                        ? "Aufnahme stoppen"
                        : "Aufnahme starten"
                    }
                  >
                    {state === "listening" ? (
                      <MicOff className="h-4 w-4" aria-hidden />
                    ) : (
                      <Mic className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {speechRecognitionSupported
                    ? "Push-to-talk"
                    : "Spracherkennung nicht verfügbar"}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setSpeechEnabled((value) => !value)}
                    aria-label={
                      speechEnabled
                        ? "Audioantworten deaktivieren"
                        : "Audioantworten aktivieren"
                    }
                  >
                    {speechEnabled ? (
                      <Volume2 className="h-4 w-4" aria-hidden />
                    ) : (
                      <VolumeX className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Audioantwort</TooltipContent>
              </Tooltip>
            </div>
            <Button
              type="button"
              onClick={() => void submit(input)}
              disabled={state === "thinking" || input.trim().length === 0}
            >
              {state === "thinking" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-2 h-4 w-4" aria-hidden />
              )}
              Senden
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
