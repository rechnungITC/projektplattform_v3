"use client"

/**
 * PROJ-151-α — Projektraum-Fläche „KI-Chat".
 *
 * Locks, die hier sichtbar werden:
 * - **L2** Nur eigene Unterhaltungen. Die Regel entscheidet das serverseitig;
 *   die Fläche sagt es dem Nutzer, damit er weiß, dass er frei formulieren kann.
 * - **L3** Die Class-3-Warnung erscheint vor dem Senden und hält nichts auf.
 * - **L5** Rein lesend — es gibt keinen Knopf, der Geschäftsdaten ändert.
 *
 * Ein abgeschaltetes Modul ist ein ZUSTAND, kein Fehler (PROJ-Y-143f).
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Lock, MessageSquarePlus, ShieldCheck } from "lucide-react"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { useAiChat } from "@/hooks/use-ai-chat"
import { checkInput, listPromptTemplates, type ChatPromptTemplate } from "@/lib/ai-chat/api"

import { AiChatComposer } from "./ai-chat-composer"
import { AiChatMessages } from "./ai-chat-messages"
import { reasonToNotice } from "./reason-notice"

export function AiChatPage({ projectId }: { projectId: string }) {
  const chat = useAiChat(projectId)
  const [templates, setTemplates] = useState<ChatPromptTemplate[]>([])
  const [draft, setDraft] = useState("")
  const [personalWarning, setPersonalWarning] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const t = await listPromptTemplates()
        if (!cancelled) setTemplates(t)
      } catch {
        // Vorlagen sind eine Erleichterung, keine Voraussetzung — ein
        // Fehlschlag hier darf den Chat nicht blockieren.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Vorprüfung verzögert: bei jedem Tastendruck zu prüfen wäre Dauerfeuer auf
  // den Server und ein flackernder Hinweis.
  useEffect(() => {
    // Kein synchrones setState im Effekt (react-hooks/set-state-in-effect):
    // bei zu kurzem Text wird gar nicht erst geprüft, und die Anzeige leitet
    // sich unten aus der Länge ab statt hier zurückgesetzt zu werden.
    if (draft.trim().length < 12) return
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const r = await checkInput(projectId, draft)
          if (!cancelled) setPersonalWarning(r.looks_personal)
        } catch {
          // Eine fehlgeschlagene Vorprüfung darf das Senden nicht verhindern —
          // sie ist ein Hinweis, kein Tor (L3).
        }
      })()
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draft, projectId])

  const handleSend = useCallback(async () => {
    const content = draft.trim()
    if (!content) return
    setDraft("")
    setPersonalWarning(false)
    await chat.send(content)
  }, [draft, chat])

  if (chat.unavailable) {
    return (
      <ModuleUnavailableNotice
        title="Der KI-Chat ist für diesen Arbeitsbereich nicht aktiv"
        description="Der projektbezogene KI-Chat gehört zum Modul „KI-Chat“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  if (chat.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const notice = chat.lastResult ? reasonToNotice(chat.lastResult) : null
  // Die Warnung gilt nur für den Text, der auch geprüft wurde. Abgeleitet statt
  // im Effekt zurückgesetzt — sonst wäre sie nach dem Löschen kurz noch sichtbar.
  const showPersonalWarning = personalWarning && draft.trim().length >= 12

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Lock className="size-3.5" aria-hidden />
            Meine Unterhaltungen
          </CardTitle>
          {/* L2 aussprechen: der Nutzer soll wissen, dass er frei denken kann. */}
          <p className="text-xs text-muted-foreground">
            Nur für dich sichtbar — auch nicht für die Projektleitung.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => void chat.start("Neue Unterhaltung")}
          >
            <MessageSquarePlus className="size-4" aria-hidden />
            Neue Unterhaltung
          </Button>

          {chat.conversations.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Noch keine Unterhaltung. Stell die erste Frage zu diesem Projekt.
            </p>
          ) : (
            <ScrollArea className="max-h-72">
              <ul className="space-y-1">
                {chat.conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => chat.select(c.id)}
                      aria-current={chat.activeId === c.id ? "true" : undefined}
                      className={`w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                        chat.activeId === c.id ? "bg-muted font-medium" : ""
                      }`}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-[28rem] flex-col">
        <CardContent className="flex flex-1 flex-col gap-3 pt-6">
          {chat.error && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>Fehler</AlertTitle>
              <AlertDescription>{chat.error}</AlertDescription>
            </Alert>
          )}

          {notice && (
            <Alert>
              <AlertTriangle className="size-4" aria-hidden />
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription>{notice.body}</AlertDescription>
            </Alert>
          )}

          {/* Wenn nichts gespeichert wird, muss die Fläche es SAGEN — ein still
              leerer Verlauf sähe aus wie ein Fehler (AC-151H.4). */}
          {chat.lastResult?.history_retention === "none" && (
            <Alert>
              <ShieldCheck className="size-4" aria-hidden />
              <AlertTitle>Verlauf wird nicht gespeichert</AlertTitle>
              <AlertDescription>
                Dieser Arbeitsbereich speichert keine Chat-Verläufe. Die Antwort steht
                hier, ist nach dem Verlassen der Seite aber nicht mehr abrufbar.
              </AlertDescription>
            </Alert>
          )}

          {chat.activeId === null ? (
            <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Wähle links eine Unterhaltung oder beginne eine neue.
            </p>
          ) : (
            <AiChatMessages
              messages={chat.messages}
              pendingAnswer={
                chat.lastResult?.history_retention === "none"
                  ? chat.lastResult.answer_text
                  : null
              }
            />
          )}

          {chat.lastResult && chat.lastResult.skills_applied.length > 0 && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Wirkende Skills:
              {chat.lastResult.skills_applied.map((s) => (
                <Badge key={s} variant="secondary" className="font-normal">
                  {s}
                </Badge>
              ))}
            </p>
          )}

          {chat.lastResult?.context_truncated && (
            <p className="text-xs text-muted-foreground">
              Hinweis: Der Verlauf ist gekürzt — frühere Nachrichten fließen nicht mehr
              in die Antwort ein.
            </p>
          )}

          {chat.activeId !== null && (
            <AiChatComposer
              value={draft}
              onChange={setDraft}
              onSend={() => void handleSend()}
              sending={chat.sending}
              personalWarning={showPersonalWarning}
              templates={templates}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
