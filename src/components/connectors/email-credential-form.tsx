"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface EmailCredentialFormProps {
  /** True when a credential row already exists in tenant_secrets. */
  alreadyConfigured: boolean
  submitting: boolean
  onSave: (payload: { api_key: string; from_email: string }) => Promise<void> | void
  onDelete?: () => Promise<void> | void
}

/**
 * Hand-written form for the Resend connector. The Zod schema lives on the
 * server (`lib/connectors/descriptors.ts`) and validates the payload server-
 * side; this UI does light client-side checks for UX feedback.
 *
 * When the connector is already configured the api_key field is empty and
 * shows a "(unverändert lassen, um nicht zu überschreiben)" hint — but
 * because we save plaintext via PATCH, an empty submission would write an
 * empty key. So if alreadyConfigured and the user wants to *only* change
 * the from_email, they must re-enter the api_key. (Acceptable for MVP;
 * partial-update would require schema changes server-side.)
 */
export function EmailCredentialForm({
  alreadyConfigured,
  submitting,
  onSave,
  onDelete,
}: EmailCredentialFormProps) {
  const [apiKey, setApiKey] = React.useState("")
  const [fromEmail, setFromEmail] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (apiKey.trim().length < 10) {
      setError("API-Key fehlt oder ist zu kurz (mind. 10 Zeichen).")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail.trim())) {
      setError("Absender muss eine gültige E-Mail-Adresse sein.")
      return
    }
    setError(null)
    await onSave({
      api_key: apiKey.trim(),
      from_email: fromEmail.trim(),
    })
    setApiKey("")
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="resend_api_key">
          Resend API-Key{" "}
          {alreadyConfigured ? (
            <span className="text-xs font-normal text-muted-foreground">
              (Eintrag vorhanden — neuer Wert ersetzt den alten)
            </span>
          ) : null}
        </Label>
        <Input
          id="resend_api_key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={alreadyConfigured ? "••••••••" : "re_..."}
        />
        <p className="text-xs text-muted-foreground">
          Server-only. Wird verschlüsselt in <code>tenant_secrets</code> abgelegt.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="resend_from_email">Absender-Adresse</Label>
        <Input
          id="resend_from_email"
          type="email"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="noreply@your-domain.tld"
        />
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
