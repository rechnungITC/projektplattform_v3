"use client"

import { Loader2, Mail, Plus, RefreshCw, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ApiRequestError,
  deleteMailbox,
  listMailboxes,
  testMailbox,
  type Mailbox,
} from "@/lib/mailboxes/api"
import {
  PROVIDER_LABELS,
  STATUS_PRESENTATION,
  describeLastCheck,
} from "@/lib/mailboxes/labels"

import { MailboxCreateDialog } from "./mailbox-create-dialog"

/**
 * PROJ-158-α — die Postfächer des angemeldeten Nutzers.
 *
 * Nutzer-privat: hier erscheint ausschliesslich das eigene Postfach, auch für
 * die Mandanten-Administration (AC-158.5b, live belegt). Die Fläche liegt
 * deshalb unter den **persönlichen** Einstellungen und nicht unter
 * `/konnektoren` — jene Seite ist `adminOnly` und hätte die Funktion für
 * gewöhnliche Mitglieder unsichtbar gemacht, also genau die Nutzer
 * ausgeschlossen, für die sie gedacht ist.
 */
export function MailboxesSection() {
  const [mailboxes, setMailboxes] = React.useState<Mailbox[]>([])
  const [hasLoaded, setHasLoaded] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [testingId, setTestingId] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Mailbox | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const rows = await listMailboxes()
      setMailboxes(rows)
      setLoadError(null)
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Postfächer konnten nicht geladen werden."
      )
    } finally {
      setHasLoaded(true)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await listMailboxes().catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Postfächer konnten nicht geladen werden."
          )
        }
        return null
      })
      if (cancelled) return
      if (rows) setMailboxes(rows)
      setHasLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onTest(mailbox: Mailbox) {
    setTestingId(mailbox.id)
    try {
      const outcome = await testMailbox(mailbox.id)
      if (outcome.mailbox) {
        setMailboxes((prev) =>
          prev.map((m) => (m.id === mailbox.id ? outcome.mailbox! : m))
        )
      }
      if (outcome.result === "connected") {
        toast.success("Verbindung steht", {
          description:
            outcome.folder_count !== null
              ? `${outcome.folder_count} Ordner gefunden. Es wurde keine E-Mail gelesen.`
              : "Es wurde keine E-Mail gelesen.",
        })
      } else {
        const presentation =
          STATUS_PRESENTATION[
            (outcome.mailbox?.status ?? "error") as keyof typeof STATUS_PRESENTATION
          ]
        toast.error(presentation.label, { description: presentation.hint })
      }
    } catch (err) {
      const message =
        err instanceof ApiRequestError && err.status === 422
          ? err.message
          : "Die Prüfung konnte nicht durchgeführt werden."
      toast.error("Prüfung fehlgeschlagen", { description: message })
    } finally {
      setTestingId(null)
    }
  }

  async function onDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteMailbox(pendingDelete.id)
      setMailboxes((prev) => prev.filter((m) => m.id !== pendingDelete.id))
      toast.success("Postfach entfernt", {
        description: "Zugangsdaten wurden mitgelöscht.",
      })
      setPendingDelete(null)
    } catch {
      toast.error("Postfach konnte nicht entfernt werden.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Postfächer</h1>
          <p className="text-sm text-muted-foreground">
            Binde dein eigenes E-Mail-Postfach an. Nur du siehst es — auch die
            Workspace-Administration nicht.
          </p>
        </div>
        <MailboxCreateDialog
          onCreated={() => void load()}
          trigger={
            <Button>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Postfach hinzufügen
            </Button>
          }
        />
      </div>

      {/* Die Zusage, die vor dem Speichern gilt und danach weiter gilt
          (AC-158.15). Sie steht hier und nicht nur im Anlege-Dialog, damit sie
          auch beim späteren Ansehen sichtbar bleibt. */}
      <Alert>
        <Mail className="h-4 w-4" aria-hidden />
        <AlertDescription>
          In dieser Ausbaustufe wird <strong>keine E-Mail abgerufen, gespeichert
          oder ausgewertet</strong>. Die Prüfung stellt nur die Verbindung her und
          liest die Namen der Ordner.
        </AlertDescription>
      </Alert>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {!hasLoaded ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : mailboxes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Noch kein Postfach angebunden</CardTitle>
            <CardDescription>
              Aktuell ist ein eigener IMAP-Server möglich. Microsoft 365 und Gmail
              folgen in der nächsten Ausbaustufe.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-3">
          {mailboxes.map((mailbox) => {
            const presentation = STATUS_PRESENTATION[mailbox.status]
            return (
              <li key={mailbox.id}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{mailbox.label}</CardTitle>
                        <CardDescription>
                          {PROVIDER_LABELS[mailbox.provider]}
                          {mailbox.imap_host ? ` · ${mailbox.imap_host}` : ""}
                          {mailbox.imap_username ? ` · ${mailbox.imap_username}` : ""}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          presentation.tone === "success"
                            ? "default"
                            : presentation.tone === "neutral"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {presentation.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Der Zustand wird NIE ohne seinen Zeitpunkt gezeigt: er ist
                        ein gespeichertes Prüfergebnis, keine Live-Aussage. */}
                    <p className="text-xs text-muted-foreground">
                      {describeLastCheck(mailbox.last_checked_at)}
                    </p>
                    {presentation.hint ? (
                      <p className="text-sm text-muted-foreground">{presentation.hint}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testingId === mailbox.id}
                        onClick={() => void onTest(mailbox)}
                      >
                        {testingId === mailbox.id ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                        )}
                        Verbindung prüfen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingDelete(mailbox)}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" aria-hidden />
                        Entfernen
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Postfach entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `„${pendingDelete.label}" wird entfernt und die hinterlegten Zugangsdaten werden gelöscht. Dein Postfach beim Anbieter bleibt unberührt.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={() => void onDelete()}>
              {deleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
