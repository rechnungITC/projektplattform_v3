"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { OutboxDraftInput } from "@/lib/communication/api"
import {
  CHANNEL_LABELS,
  CHANNELS,
  type Channel,
  type CommunicationOutboxEntry,
} from "@/types/communication"

interface DraftFormProps {
  initial?: CommunicationOutboxEntry
  submitting: boolean
  onSubmit: (input: OutboxDraftInput) => Promise<void> | void
  onCancel?: () => void
  secondaryAction?: React.ReactNode
}

export function DraftForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  secondaryAction,
}: DraftFormProps) {
  const [channel, setChannel] = React.useState<Channel>(
    initial?.channel ?? "internal"
  )
  const [recipient, setRecipient] = React.useState(initial?.recipient ?? "")
  const [subject, setSubject] = React.useState(initial?.subject ?? "")
  const [body, setBody] = React.useState(initial?.body ?? "")
  const [validationError, setValidationError] = React.useState<string | null>(
    null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (recipient.trim().length === 0) {
      setValidationError("Empfänger ist erforderlich.")
      return
    }
    if (body.trim().length === 0) {
      setValidationError("Inhalt ist erforderlich.")
      return
    }
    setValidationError(null)
    await onSubmit({
      channel,
      recipient: recipient.trim(),
      subject: subject.trim() || null,
      body,
      metadata: initial?.metadata,
    })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="channel">Kanal</Label>
        <Select
          value={channel}
          onValueChange={(v) => setChannel(v as Channel)}
        >
          <SelectTrigger id="channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="recipient">
          Empfänger{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {channel === "email"
              ? "(E-Mail-Adresse)"
              : channel === "slack"
                ? "(Channel oder Webhook)"
                : channel === "teams"
                  ? "(Channel oder Webhook)"
                  : "(intern, Freitext)"}
          </span>
        </Label>
        <Input
          id="recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          maxLength={320}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Betreff (optional)</Label>
        <Input
          id="subject"
          value={subject ?? ""}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={255}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Inhalt</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={50000}
          required
          className="resize-y"
        />
        <p className="text-xs text-muted-foreground">
          {body.length} / 50000 Zeichen
        </p>
      </div>

      {validationError ? (
        <p className="text-sm text-destructive">{validationError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {secondaryAction}
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting
            ? "Speichere …"
            : initial
              ? "Entwurf speichern"
              : "Entwurf anlegen"}
        </Button>
      </div>
    </form>
  )
}
