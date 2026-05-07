"use client"

import {
  AlertCircle,
  CheckCircle2,
  FileEdit,
  Mail,
  MessageCircle,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { DispatchSummary, OutboxDraftInput } from "@/lib/communication/api"
import { useOutbox } from "@/hooks/use-outbox"
import {
  CHANNEL_LABELS,
  CHANNELS,
  OUTBOX_STATUS_LABELS,
  OUTBOX_STATUSES,
  type Channel,
  type CommunicationOutboxEntry,
  type OutboxStatus,
} from "@/types/communication"

import { DraftForm } from "./draft-form"

const ALL = "__all__"

const CHANNEL_ICON: Record<Channel, React.ComponentType<{ className?: string }>> = {
  internal: Users,
  email: Mail,
  slack: MessageCircle,
  teams: MessageCircle,
}

function statusVariant(
  status: OutboxStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "draft":
      return "outline"
    case "queued":
      return "secondary"
    case "sent":
      return "default"
    case "failed":
      return "destructive"
    case "suppressed":
      return "destructive"
  }
}

interface OutboxPanelProps {
  projectId: string
  /** True when no RESEND_API_KEY is configured server-side. Surfaces a banner. */
  emailStubMode: boolean
}

type DrawerState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; entry: CommunicationOutboxEntry }

export function OutboxPanel({ projectId, emailStubMode }: OutboxPanelProps) {
  const [channelFilter, setChannelFilter] = React.useState<
    Channel | typeof ALL
  >(ALL)
  const [statusFilter, setStatusFilter] = React.useState<
    OutboxStatus | typeof ALL
  >(ALL)
  const [drawer, setDrawer] = React.useState<DrawerState>({ mode: "closed" })
  const [submitting, setSubmitting] = React.useState(false)

  const filters = React.useMemo(
    () => ({
      channel: channelFilter === ALL ? undefined : channelFilter,
      status: statusFilter === ALL ? undefined : statusFilter,
    }),
    [channelFilter, statusFilter]
  )

  const {
    entries,
    loading,
    error,
    refresh,
    createDraft,
    updateDraft,
    deleteDraft,
    send,
  } = useOutbox(projectId, filters)

  async function handleCreate(input: OutboxDraftInput) {
    setSubmitting(true)
    try {
      await createDraft(input)
      toast.success("Entwurf angelegt")
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Entwurf konnte nicht angelegt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(
    entry: CommunicationOutboxEntry,
    input: OutboxDraftInput
  ) {
    setSubmitting(true)
    try {
      const updated = await updateDraft(entry.id, input)
      toast.success("Entwurf gespeichert")
      setDrawer({ mode: "edit", entry: updated })
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(entry: CommunicationOutboxEntry) {
    if (!window.confirm(`Entwurf an „${entry.recipient}" verwerfen?`)) return
    try {
      await deleteDraft(entry.id)
      toast.success("Entwurf verworfen")
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Verwerfen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  async function handleSend(entry: CommunicationOutboxEntry) {
    if (!window.confirm(`Nachricht an „${entry.recipient}" jetzt senden?`)) {
      return
    }
    try {
      const { dispatch } = await send(entry.id)
      surfaceDispatch(dispatch)
      setDrawer({ mode: "closed" })
    } catch (err) {
      toast.error("Versand fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    }
  }

  return (
    <>
      <div className="space-y-4">
        {emailStubMode ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Demo-Modus für E-Mail</p>
              <p className="text-xs">
                Kein <code>RESEND_API_KEY</code> konfiguriert — E-Mail-Sends
                werden lokal als „gesendet“ markiert, aber nicht wirklich
                zugestellt.
              </p>
            </div>
          </div>
        ) : null}

        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Outbox</h2>
            <p className="text-sm text-muted-foreground">
              Drafts, Versandstatus und Fehlermeldungen pro Kanal.
            </p>
          </div>
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Neue Nachricht
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={channelFilter}
            onValueChange={(v) => setChannelFilter(v as Channel | typeof ALL)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Kanäle</SelectItem>
              {CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as OutboxStatus | typeof ALL)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alle Status</SelectItem>
              {OUTBOX_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {OUTBOX_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Outbox …</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : entries.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Keine Einträge. Lege eine neue Nachricht an oder ändere die
              Filter.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <OutboxRow
                key={entry.id}
                entry={entry}
                onEdit={() => setDrawer({ mode: "edit", entry })}
                onSend={() => void handleSend(entry)}
                onDelete={() => void handleDelete(entry)}
              />
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" })
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer.mode === "edit"
                ? "Entwurf bearbeiten"
                : "Neue Nachricht"}
            </SheetTitle>
            <SheetDescription>
              {drawer.mode === "edit"
                ? `Solange der Eintrag im Status „Entwurf“ ist, kann er geändert werden. Nach dem Senden ist der Inhalt eingefroren.`
                : "Erstelle einen Entwurf. Senden ist im nächsten Schritt möglich."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {drawer.mode === "create" ? (
              <DraftForm
                submitting={submitting}
                onSubmit={handleCreate}
                onCancel={() => setDrawer({ mode: "closed" })}
              />
            ) : drawer.mode === "edit" ? (
              <div className="space-y-4">
                <DraftForm
                  initial={drawer.entry}
                  submitting={submitting}
                  onSubmit={(input) => handleUpdate(drawer.entry, input)}
                  onCancel={() => setDrawer({ mode: "closed" })}
                  secondaryAction={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleDelete(drawer.entry)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                      Verwerfen
                    </Button>
                  }
                />
                {drawer.entry.status === "draft" ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => void handleSend(drawer.entry)}
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    Jetzt senden
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )

  function surfaceDispatch(dispatch: DispatchSummary) {
    if (dispatch.status === "sent") {
      toast.success(
        dispatch.stub
          ? "Im Demo-Modus als gesendet markiert"
          : "Nachricht gesendet",
        dispatch.stub
          ? {
              description:
                "Es ist kein echter Provider konfiguriert. Trage RESEND_API_KEY ein, um wirklich zu versenden.",
            }
          : undefined
      )
      return
    }
    if (dispatch.status === "suppressed") {
      toast.error("Versand blockiert (Klasse-3)", {
        description:
          dispatch.error_detail ??
          "Der Inhalt enthält schützenswerte Daten und darf nicht extern versendet werden.",
      })
      return
    }
    toast.error("Versand fehlgeschlagen", {
      description: dispatch.error_detail ?? "Unbekannter Provider-Fehler.",
    })
    void refresh()
  }
}

interface OutboxRowProps {
  entry: CommunicationOutboxEntry
  onEdit: () => void
  onSend: () => void
  onDelete: () => void
}

function OutboxRow({ entry, onEdit, onSend, onDelete }: OutboxRowProps) {
  const Icon = CHANNEL_ICON[entry.channel]
  const isDraft = entry.status === "draft"
  const aiDrafted = entry.metadata?.ki_drafted === true
  return (
    <li className="rounded-md border bg-card p-3 transition-colors hover:bg-accent/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Icon className="h-3 w-3" aria-hidden />
              {CHANNEL_LABELS[entry.channel]}
            </Badge>
            <Badge variant={statusVariant(entry.status)}>
              {entry.status === "sent" ? (
                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
              ) : entry.status === "suppressed" ? (
                <ShieldAlert className="mr-1 h-3 w-3" aria-hidden />
              ) : null}
              {OUTBOX_STATUS_LABELS[entry.status]}
            </Badge>
            {aiDrafted ? (
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" aria-hidden />
                KI-Entwurf
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-sm font-medium">
            {entry.subject || "(ohne Betreff)"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            an {entry.recipient}
          </p>
          {entry.error_detail ? (
            <p className="text-xs text-destructive">
              {entry.error_detail}
            </p>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={!isDraft}
          >
            <FileEdit className="mr-1 h-3.5 w-3.5" aria-hidden />
            Bearbeiten
          </Button>
          {isDraft ? (
            <>
              <Button type="button" size="sm" onClick={onSend}>
                <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
                Senden
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  )
}
