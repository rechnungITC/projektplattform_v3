"use client"

import { Send } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/use-auth"
import { useChat } from "@/hooks/use-chat"
import { cn } from "@/lib/utils"

interface ChatPanelProps {
  projectId: string
}

const TIME_FMT = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
})

export function ChatPanel({ projectId }: ChatPanelProps) {
  const { messages, loading, error, send } = useChat(projectId)
  const { user } = useAuth()
  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom whenever the message list grows.
  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages.length])

  async function handleSend() {
    const trimmed = draft.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      await send(trimmed)
      setDraft("")
    } catch (err) {
      toast.error("Nachricht konnte nicht gesendet werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="flex h-[60vh] flex-col rounded-md border bg-card">
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-3 p-4">
          {loading && messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Lade Chat …</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Nachrichten. Schreib die erste!
            </p>
          ) : (
            messages.map((m) => {
              const isMine = m.sender_user_id === user?.id
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-1",
                    isMine ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                      isMine
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  </div>
                  <span className="px-1 text-xs text-muted-foreground">
                    {m.sender_user_id === null
                      ? "Entfernter Nutzer"
                      : isMine
                        ? "Du"
                        : "Mitglied"}
                    {" · "}
                    {TIME_FMT.format(new Date(m.created_at))}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Nachricht schreiben … (Enter = senden, Shift+Enter = Zeilenumbruch)"
          rows={2}
          maxLength={4000}
          className="min-h-[60px] resize-none"
          disabled={sending}
        />
        <Button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || draft.trim().length === 0}
        >
          <Send className="mr-2 h-4 w-4" aria-hidden />
          Senden
        </Button>
      </div>
    </div>
  )
}
