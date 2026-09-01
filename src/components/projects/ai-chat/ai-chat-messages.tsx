"use client"

/** PROJ-151-α — Nachrichtenliste. Rollen sind sichtbar getrennt. */

import { ScrollArea } from "@/components/ui/scroll-area"
import type { ChatMessage } from "@/lib/ai-chat/api"

export function AiChatMessages({
  messages,
  pendingAnswer,
}: {
  messages: ChatMessage[]
  /** Nur gesetzt, wenn die Aufbewahrung aus ist: die Antwort existiert dann
   *  nirgends sonst und wird einmalig gezeigt. */
  pendingAnswer: string | null
}) {
  const nothingStored = messages.length === 0 && !pendingAnswer

  return (
    <ScrollArea className="min-h-64 flex-1 rounded border p-3">
      {nothingStored ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Noch keine Nachrichten. Stell deine Frage zu diesem Projekt.
        </p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                <span className="sr-only">
                  {m.role === "user" ? "Deine Frage:" : "Antwort:"}
                </span>
                {m.content || (
                  <em className="text-muted-foreground">(kein Text gespeichert)</em>
                )}
              </div>
            </li>
          ))}
          {pendingAnswer && (
            <li className="flex justify-start">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="sr-only">Antwort:</span>
                {pendingAnswer}
              </div>
            </li>
          )}
        </ul>
      )}
    </ScrollArea>
  )
}
