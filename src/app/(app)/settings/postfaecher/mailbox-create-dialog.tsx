"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiRequestError, createMailbox } from "@/lib/mailboxes/api"
import { HOST_ERROR_LABELS, PROVIDER_LABELS, SECURITY_LABELS } from "@/lib/mailboxes/labels"
import {
  MAILBOX_PROVIDERS,
  MAILBOX_SECURITY,
  ALPHA_PROVIDERS,
  type MailboxProvider,
  type MailboxSecurity,
} from "@/lib/mailboxes/validation"

/**
 * PROJ-158-α — Postfach anbinden.
 *
 * Die beiden OAuth-Anbieter stehen **sichtbar** zur Wahl, sind aber
 * ausgegraut und erklärt. Sie ganz wegzulassen wäre bequemer und falsch: der
 * Nutzer soll wissen, dass sie kommen — und vor allem, dass für sie **kein
 * Passwort** mehr zulässig ist. Das ist Anbieterpolitik, keine Entscheidung
 * dieses Produkts (Erdungsbefund B-2 der Spec).
 */
export function MailboxCreateDialog({
  trigger,
  onCreated,
}: {
  trigger: React.ReactNode
  onCreated: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [provider, setProvider] = React.useState<MailboxProvider>("imap")
  const [security, setSecurity] = React.useState<MailboxSecurity>("tls")
  const [fieldError, setFieldError] = React.useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError(null)
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await createMailbox({
        label: String(form.get("label") ?? "").trim(),
        provider,
        imap_host: String(form.get("imap_host") ?? "").trim(),
        imap_port: Number(form.get("imap_port") ?? 993),
        imap_security: security,
        imap_username: String(form.get("imap_username") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      })
      toast.success("Postfach angebunden", {
        description: "Prüfe jetzt die Verbindung — gespeichert ist noch nicht geprüft.",
      })
      setOpen(false)
      onCreated()
    } catch (err) {
      if (err instanceof ApiRequestError) {
        // Der Server gibt Kennungen zurück, keine fertigen Sätze (AC-158.9).
        // Übersetzt wird an genau einer Stelle.
        if (err.code === "invalid_host") {
          setFieldError(HOST_ERROR_LABELS[err.message] ?? HOST_ERROR_LABELS.host_malformed)
        } else if (err.code === "duplicate_mailbox") {
          setFieldError("Dieses Postfach oder dieser Name ist bereits angebunden.")
        } else {
          setFieldError(err.message)
        }
      } else {
        setFieldError("Das Postfach konnte nicht angebunden werden.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Postfach anbinden</DialogTitle>
          <DialogDescription>
            Es wird <strong>keine E-Mail abgerufen</strong> — nur die Verbindung
            hinterlegt. Das Abrufen kommt in der nächsten Ausbaustufe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mailbox-provider">Anbieter</Label>
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as MailboxProvider)}
            >
              <SelectTrigger id="mailbox-provider" aria-label="Anbieter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAILBOX_PROVIDERS.map((p) => (
                  <SelectItem
                    key={p}
                    value={p}
                    disabled={!ALPHA_PROVIDERS.includes(p)}
                  >
                    {PROVIDER_LABELS[p]}
                    {ALPHA_PROVIDERS.includes(p) ? "" : " — folgt"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {provider === "imap" ? null : (
              <p className="text-xs text-muted-foreground">
                Microsoft 365 und Gmail lassen für den Postfachzugriff seit 2025
                bzw. 2026 <strong>keine Passwörter</strong> mehr zu; sie brauchen
                eine Freigabe beim Anbieter. Diese folgt in der nächsten
                Ausbaustufe.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mailbox-label">Name</Label>
            <Input
              id="mailbox-label"
              name="label"
              required
              maxLength={120}
              placeholder="z. B. Geschäftlich"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mailbox-host">Server</Label>
              <Input
                id="mailbox-host"
                name="imap_host"
                required
                placeholder="imap.example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mailbox-port">Port</Label>
              <Input
                id="mailbox-port"
                name="imap_port"
                type="number"
                defaultValue={993}
                min={1}
                max={65535}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mailbox-security">Verschlüsselung</Label>
              <Select
                value={security}
                onValueChange={(v) => setSecurity(v as MailboxSecurity)}
              >
                <SelectTrigger id="mailbox-security" aria-label="Verschlüsselung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAILBOX_SECURITY.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SECURITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mailbox-username">Benutzername</Label>
              <Input
                id="mailbox-username"
                name="imap_username"
                required
                autoComplete="off"
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mailbox-password">Passwort</Label>
              <Input
                id="mailbox-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Das Passwort wird verschlüsselt abgelegt und ist danach{" "}
            <strong>nicht mehr lesbar</strong> — auch nicht für dich. Zum Ändern
            gibst du es neu ein.
          </p>

          {fieldError ? (
            <Alert variant="destructive">
              <AlertDescription>{fieldError}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy || provider !== "imap"}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
