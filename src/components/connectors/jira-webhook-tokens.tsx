"use client"

/**
 * PROJ-50 β — Jira inbound webhook token management (tenant-admin).
 *
 * Mounted in the Jira connector drawer. Lets an admin issue an inbound
 * webhook token (the URL Jira posts to), revealing the raw token + full
 * webhook URL exactly ONCE in a copyable callout, then list/revoke tokens.
 * The raw token is never retrievable again — only its hash is stored.
 */

import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type IssuedJiraWebhookToken,
  type JiraWebhookTokenMeta,
  issueJiraWebhookToken,
  listJiraWebhookTokens,
  revokeJiraWebhookToken,
} from "@/lib/jira/inbound-api"

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          toast.success(`${label} kopiert`)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? (
        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      )}
      {label}
    </Button>
  )
}

export function JiraWebhookTokens() {
  const [tokens, setTokens] = React.useState<JiraWebhookTokenMeta[]>([])
  const [loading, setLoading] = React.useState(true)
  const [label, setLabel] = React.useState("")
  const [issuing, setIssuing] = React.useState(false)
  const [revoking, setRevoking] = React.useState<string | null>(null)
  const [issued, setIssued] = React.useState<IssuedJiraWebhookToken | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      setTokens(await listJiraWebhookTokens())
    } catch (err) {
      toast.error("Tokens konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // Mount-time data fetch; refresh() sets its own loading flag. Established
    // project convention for fetch-on-mount effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  async function handleIssue() {
    setIssuing(true)
    try {
      const result = await issueJiraWebhookToken(label.trim() || undefined)
      setIssued(result)
      setLabel("")
      toast.success("Webhook-Token erstellt", {
        description: "Token jetzt kopieren — er wird nur einmal angezeigt.",
      })
      await refresh()
    } catch (err) {
      toast.error("Token konnte nicht erstellt werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setIssuing(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm("Diesen Webhook-Token wirklich widerrufen?")) return
    setRevoking(id)
    try {
      await revokeJiraWebhookToken(id)
      toast.success("Token widerrufen")
      await refresh()
    } catch (err) {
      toast.error("Widerruf fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setRevoking(null)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-medium">Inbound-Webhook (PROJ-50)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Erzeuge eine Webhook-URL, die du in Jira als ausgehenden Webhook
          hinterlegst. Jira meldet darüber Änderungen zurück; die URL enthält
          ein Geheimnis und wird nur einmal angezeigt.
        </p>

        {/* Reveal-once callout */}
        {issued ? (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-medium text-primary">
              Einmalige Anzeige — jetzt kopieren, danach nicht mehr abrufbar:
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Webhook-URL</Label>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {issued.webhook_url}
              </code>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={issued.webhook_url} label="URL kopieren" />
              <CopyButton value={issued.token} label="Token kopieren" />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIssued(null)}
              >
                Schließen
              </Button>
            </div>
          </div>
        ) : null}

        {/* Issue form */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="jira-webhook-label" className="text-xs">
              Bezeichnung (optional)
            </Label>
            <Input
              id="jira-webhook-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z. B. Jira Cloud Prod"
              maxLength={120}
            />
          </div>
          <Button type="button" onClick={() => void handleIssue()} disabled={issuing}>
            {issuing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="mr-1.5 h-4 w-4" aria-hidden />
            )}
            Token erstellen
          </Button>
        </div>

        {/* Token list */}
        {loading ? (
          <p className="text-xs text-muted-foreground">Lade Tokens …</p>
        ) : tokens.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Noch keine Webhook-Tokens.
          </p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => {
              const revoked = t.revoked_at !== null
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm">
                        {t.label || "(ohne Bezeichnung)"}
                      </span>
                      {revoked ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          widerrufen
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          aktiv
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Erstellt {new Date(t.created_at).toLocaleDateString("de-DE")}
                      {t.last_used_at
                        ? ` · zuletzt genutzt ${new Date(t.last_used_at).toLocaleDateString("de-DE")}`
                        : " · noch nie genutzt"}
                    </p>
                  </div>
                  {!revoked ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleRevoke(t.id)}
                      disabled={revoking === t.id}
                      aria-label="Token widerrufen"
                    >
                      {revoking === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
