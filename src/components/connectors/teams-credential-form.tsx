"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TeamsCredentialFormProps {
  /** True when a credential row already exists in tenant_secrets. */
  alreadyConfigured: boolean
  submitting: boolean
  onSave: (payload: { webhook_url: string }) => Promise<void> | void
  onDelete?: () => Promise<void> | void
}

/**
 * PROJ-49 — hand-written form for the Microsoft Teams connector. The tenant
 * admin pastes a Teams **Workflows incoming-webhook URL** (Power Automate);
 * the Zod schema (`TeamsCredentialSchema = { webhook_url }`) validates it
 * server-side, this UI does a light https check for fast feedback. The URL is
 * stored encrypted in `tenant_secrets`; "Test-Connection" in the drawer runs
 * the descriptor health probe against it.
 */
export function TeamsCredentialForm({
  alreadyConfigured,
  submitting,
  onSave,
  onDelete,
}: TeamsCredentialFormProps) {
  const [webhookUrl, setWebhookUrl] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = webhookUrl.trim()
    if (!/^https:\/\/[^\s]+$/i.test(url)) {
      setError("Bitte eine gültige https-Webhook-URL eingeben.")
      return
    }
    setError(null)
    await onSave({ webhook_url: url })
    setWebhookUrl("")
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="teams_webhook_url">
          Workflows-Webhook-URL{" "}
          {alreadyConfigured ? (
            <span className="text-xs font-normal text-muted-foreground">
              (Eintrag vorhanden — neuer Wert ersetzt den alten)
            </span>
          ) : null}
        </Label>
        <Input
          id="teams_webhook_url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder={
            alreadyConfigured
              ? "••••••••"
              : "https://prod-….logic.azure.com/workflows/…/triggers/manual/paths/invoke?…"
          }
        />
        <p className="text-xs text-muted-foreground">
          In Teams: Workflow „Beim Empfang einer Webhook-Anforderung in einem
          Kanal posten“ anlegen und die erzeugte URL hier einfügen. Wird
          verschlüsselt in <code>tenant_secrets</code> abgelegt; nie geloggt.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {alreadyConfigured && onDelete ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onDelete()}
            disabled={submitting}
          >
            Credentials löschen
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Speichere …" : alreadyConfigured ? "Aktualisieren" : "Speichern"}
        </Button>
      </div>
    </form>
  )
}
