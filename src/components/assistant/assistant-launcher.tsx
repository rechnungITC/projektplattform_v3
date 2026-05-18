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
import { isModuleActive } from "@/lib/tenant-settings/modules"
import type {
  AssistantIntent,
  AssistantResultStatus,
  AssistantRouteTarget,
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
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultEventLike {
  results: {
    0: SpeechRecognitionResultLike
  }
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
  const { tenantSettings } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [input, setInput] = React.useState("")
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<AssistantMessage[]>([])
  const [state, setState] = React.useState<
    "idle" | "listening" | "thinking" | "responding"
  >("idle")
  const [speechEnabled, setSpeechEnabled] = React.useState(false)
  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const manualStopRef = React.useRef(false)

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

  const submit = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || state === "thinking") return
      const userMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: trimmed,
      }
      setMessages((prev) => [...prev, userMessage])
      setInput("")
      setState("thinking")

      try {
        const response = await fetch("/api/assistant/turns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            input_text: trimmed,
            modality: "text",
            project_id: currentProjectId,
            client_context_path: pathname,
          }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null
          throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
        }
        const body = (await response.json()) as AssistantTurnResponse
        setSessionId(body.session.id)
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
        }
        setMessages((prev) => [...prev, assistantMessage])
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
    [currentProjectId, pathname, sessionId, speak, state],
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
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setInput(transcript)
    }
    recognition.onerror = (event) => {
      if (manualStopRef.current) return
      if (event.error === "no-speech") {
        toast.info("Keine Sprache erkannt")
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
      setState("idle")
    }
    recognition.onend = () => {
      recognitionRef.current = null
      manualStopRef.current = false
      setState("idle")
    }
    recognitionRef.current = recognition
    manualStopRef.current = false
    setState("listening")
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setState("idle")
      toast.error("Spracherkennung konnte nicht starten", {
        description: "Bitte nutze den Textmodus oder versuche es erneut.",
      })
    }
  }, [])

  const stopListening = React.useCallback(() => {
    manualStopRef.current = true
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setState("idle")
  }, [])

  if (!assistantActive) return null

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
            {messages.length === 0 ? (
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
                {message.choices && message.choices.length > 0 ? (
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
            onChange={(event) => setInput(event.target.value)}
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
