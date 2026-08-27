"use client"

/**
 * PROJ-151-α — Eingabe mit Vorlagen und Class-3-Warnung.
 *
 * **L3:** Die Warnung erscheint vor dem Senden und hält nichts auf. Der
 * Senden-Knopf bleibt aktiv — das ist der ganze Unterschied zwischen einem
 * Hinweis und einem Riegel, und er war eine ausdrückliche Nutzer-Entscheidung.
 */

import { AlertTriangle, Loader2, Send } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ChatPromptTemplate } from "@/lib/ai-chat/api"

export function AiChatComposer({
  value,
  onChange,
  onSend,
  sending,
  personalWarning,
  templates,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  sending: boolean
  personalWarning: boolean
  templates: ChatPromptTemplate[]
}) {
  return (
    <div className="space-y-2">
      {personalWarning && (
        <Alert>
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>Möglicherweise personenbezogene Daten</AlertTitle>
          <AlertDescription>
            Der Text sieht aus, als enthielte er persönliche Angaben. Er wird dann nur
            an ein lokales oder eigens freigegebenes Modell gesendet — nie an ein
            externes. Senden ist weiterhin möglich.
          </AlertDescription>
        </Alert>
      )}

      {templates.length > 0 && (
        <Select
          onValueChange={(id) => {
            const t = templates.find((x) => x.id === id)
            if (t) onChange(value ? `${value}\n\n${t.body}` : t.body)
          }}
        >
          <SelectTrigger className="h-8 w-full text-xs" aria-label="Vorlage einfügen">
            <SelectValue placeholder="Vorlage einfügen …" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.is_favorite ? "★ " : ""}
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Frage zu diesem Projekt …"
          rows={3}
          className="resize-none"
          aria-label="Deine Frage"
          onKeyDown={(e) => {
            // Enter sendet, Shift+Enter macht eine neue Zeile — die im Chat
            // übliche Erwartung.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (!sending && value.trim()) onSend()
            }
          }}
        />
        <Button
          onClick={onSend}
          disabled={sending || value.trim().length === 0}
          aria-label="Frage senden"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </div>
  )
}
