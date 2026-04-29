"use client"

import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Cog,
  Mail,
  MessageCircle,
  Plug,
  Send,
  Sparkles,
  Workflow,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { HealthBadge } from "@/components/connectors/health-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useConnectors } from "@/hooks/use-connectors"
import type { ConnectorListEntry } from "@/lib/connectors/api"
import type { ConnectorKey } from "@/lib/connectors/types"

import { EmailCredentialForm } from "./email-credential-form"

const ICON: Record<ConnectorKey, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  slack: MessageCircle,
  teams: MessageCircle,
  jira: Workflow,
  mcp: BrainCircuit,
  anthropic: Sparkles,
}

const SOURCE_LABEL: Record<ConnectorListEntry["status"]["credential_source"], string> = {
  tenant_secret: "Tenant-Credentials",
  env: "Plattform-Default",
  none: "Nicht konfiguriert",
}

interface DrawerState {
  entry: ConnectorListEntry
}

export function ConnectorsPageClient() {
  const { connectors, loading, error, refresh, save, remove, test } = useConnectors()
  const [drawer, setDrawer] = React.useState<DrawerState | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [testing, setTesting] = React.useState<ConnectorKey | null>(null)

  // Re-bind drawer entry to the latest registry data after refresh.
  React.useEffect(() => {
    if (!drawer) return
    const updated = connectors.find(
      (c) => c.descriptor.key === drawer.entry.descriptor.key
    )
    if (updated && updated !== drawer.entry) setDrawer({ entry: updated })
  }, [connectors, drawer])

  async function handleSave(
    key: ConnectorKey,
    payload: { api_key: string; from_email: string }
  ) {
    setSubmitting(true)
    try {
      await save(key, payload)
      toast.success("Credentials gespeichert", {
        description: "Test-Connection läuft …",
      })
      // Re-test immediately so the user sees fresh status.
      await test(key).catch(() => null)
      await refresh()
    } catch (err) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(key: ConnectorKey) {
    if (!window.confirm("Credentials wirklich löschen?")) return
    setSubmitting(true)
    try {
      await remove(key)
      toast.success("Credentials entfernt")
    } catch (err) {
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTest(key: ConnectorKey) {
    setTesting(key)
    try {
      const health = await test(key)
      const success = health.status === "adapter_ready_configured"
      const headline = success
        ? "Verbindung erfolgreich"
        : health.status === "adapter_missing"
          ? "Adapter folgt noch"
          : health.status === "error"
            ? "Verbindung fehlgeschlagen"
            : "Adapter bereit, aber nicht konfiguriert"
      const fn = success ? toast.success : toast.error
      fn(headline, { description: health.detail })
      await refresh()
    } catch (err) {
      toast.error("Test fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setTesting(null)
    }
  }

  return (
    <>
      <div className="space-y-4">
        <header>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Plug className="h-6 w-6" aria-hidden />
            Konnektoren
          </h1>
          <p className="text-sm text-muted-foreground">
            Externe Provider für Versand, Sync und KI. Pro Tenant
            konfigurierbar; Credentials liegen verschlüsselt unter{" "}
            <code>tenant_secrets</code>. Echte Adapter für Jira / MCP / Teams
            folgen als eigene Slices.
          </p>
        </header>

        {loading && connectors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lade Konnektoren …</p>
        ) : error ? (
          <Card>
            <CardContent className="flex items-start gap-2 py-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
              <p>{error}</p>
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {connectors.map((c) => (
              <ConnectorCard
                key={c.descriptor.key}
                entry={c}
                onOpen={() => setDrawer({ entry: c })}
                onTest={() => void handleTest(c.descriptor.key)}
                testing={testing === c.descriptor.key}
              />
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={drawer !== null}
        onOpenChange={(open) => {
          if (!open) setDrawer(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          {drawer ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {React.createElement(ICON[drawer.entry.descriptor.key], {
                    className: "h-5 w-5",
                  })}
                  {drawer.entry.descriptor.label}
                </SheetTitle>
                <SheetDescription>
                  {drawer.entry.descriptor.summary}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <Card>
                  <CardContent className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <HealthBadge health={drawer.entry.status.health} />
                      <Badge variant="outline" className="text-xs">
                        {SOURCE_LABEL[drawer.entry.status.credential_source]}
                      </Badge>
                      {drawer.entry.descriptor.capability_tags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    {drawer.entry.status.health.detail ? (
                      <p className="text-sm text-muted-foreground">
                        {drawer.entry.status.health.detail}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleTest(drawer.entry.descriptor.key)}
                    disabled={testing === drawer.entry.descriptor.key}
                  >
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    {testing === drawer.entry.descriptor.key
                      ? "Teste …"
                      : "Test-Connection"}
                  </Button>
                </div>

                <CredentialPanel
                  entry={drawer.entry}
                  submitting={submitting}
                  onSave={(payload) =>
                    void handleSave(drawer.entry.descriptor.key, payload)
                  }
                  onDelete={() => void handleDelete(drawer.entry.descriptor.key)}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

interface ConnectorCardProps {
  entry: ConnectorListEntry
  onOpen: () => void
  onTest: () => void
  testing: boolean
}

function ConnectorCard({ entry, onOpen, onTest, testing }: ConnectorCardProps) {
  const Icon = ICON[entry.descriptor.key]
  return (
    <li>
      <Card className="h-full transition-colors hover:border-primary">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-medium">{entry.descriptor.label}</p>
                <HealthBadge health={entry.status.health} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {SOURCE_LABEL[entry.status.credential_source]}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {entry.descriptor.summary}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onOpen}>
              <Cog className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Details
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onTest}
              disabled={testing}
            >
              {testing ? (
                "Teste …"
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Test
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  )
}

interface CredentialPanelProps {
  entry: ConnectorListEntry
  submitting: boolean
  onSave: (payload: { api_key: string; from_email: string }) => void
  onDelete: () => void
}

function CredentialPanel({
  entry,
  submitting,
  onSave,
  onDelete,
}: CredentialPanelProps) {
  const editable = entry.descriptor.credential_editable

  if (!editable) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">
          Credentials für diesen Connector sind in dieser Slice noch nicht
          editierbar — Adapter / UI folgt mit der nächsten Slice.
        </CardContent>
      </Card>
    )
  }

  // Currently only `email` is editable in this slice.
  if (entry.descriptor.key === "email") {
    return (
      <EmailCredentialForm
        alreadyConfigured={entry.status.credential_source === "tenant_secret"}
        submitting={submitting}
        onSave={onSave}
        onDelete={onDelete}
      />
    )
  }

  return (
    <Card>
      <CardContent className="py-4 text-sm text-muted-foreground">
        Credential-Form für „{entry.descriptor.label}" folgt mit der nächsten
        Slice.
      </CardContent>
    </Card>
  )
}
