"use client"

/**
 * PROJ-48 β — MCP access-token management + recent tool-call audit (admin).
 *
 * Mounted in the MCP connector drawer. Lets an admin issue a bearer token for
 * the read-only MCP bridge (/api/mcp), revealing the raw token + endpoint URL
 * exactly ONCE in a copyable callout, then list/revoke tokens and review the
 * most recent tool-call audit (tool, status, redaction count, latency).
 * The raw token is never retrievable again — only its hash is stored.
 */

import { Check, Copy, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type IssuedMcpToken,
  type McpToolCall,
  type McpTokenMeta,
  issueMcpToken,
  listMcpToolCalls,
  listMcpTokens,
  revokeMcpToken,
} from "@/lib/mcp/tokens-api"

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

function tokenState(t: McpTokenMeta): "revoked" | "expired" | "active" {
  if (t.revoked_at) return "revoked"
  if (t.expires_at && new Date(t.expires_at).getTime() <= Date.now()) return "expired"
  return "active"
}

const STATUS_TONE: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  rate_limited: "text-amber-600 dark:text-amber-400",
  unauthorized: "text-muted-foreground",
}

export function McpAccessTokens() {
  const [tokens, setTokens] = React.useState<McpTokenMeta[]>([])
  const [calls, setCalls] = React.useState<McpToolCall[]>([])
  const [loading, setLoading] = React.useState(true)
  const [label, setLabel] = React.useState("")
  const [expiresInDays, setExpiresInDays] = React.useState("")
  const [issuing, setIssuing] = React.useState(false)
  const [revoking, setRevoking] = React.useState<string | null>(null)
  const [issued, setIssued] = React.useState<IssuedMcpToken | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const [t, c] = await Promise.all([listMcpTokens(), listMcpToolCalls()])
      setTokens(t)
      setCalls(c)
    } catch (err) {
      toast.error("MCP-Daten konnten nicht geladen werden", {
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
    const days = expiresInDays.trim() ? Number(expiresInDays) : undefined
    if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > 365)) {
      toast.error("Ablauf muss zwischen 1 und 365 Tagen liegen.")
      return
    }
    setIssuing(true)
    try {
      const result = await issueMcpToken({ label: label.trim() || undefined, expiresInDays: days })
      setIssued(result)
      setLabel("")
      setExpiresInDays("")
      toast.success("MCP-Token erstellt", {
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
    if (!window.confirm("Diesen MCP-Token wirklich widerrufen?")) return
    setRevoking(id)
    try {
      await revokeMcpToken(id)
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
          <h3 className="text-sm font-medium">MCP-Zugriffstokens (PROJ-48)</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Stelle einen Bearer-Token aus, mit dem ein freigegebener KI-Agent den
          read-only MCP-Endpoint (<code className="rounded bg-muted px-1">/api/mcp</code>)
          aufruft. Der Token enthält ein Geheimnis und wird nur einmal angezeigt.
        </p>

        {/* Reveal-once callout */}
        {issued ? (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-medium text-primary">
              Einmalige Anzeige — jetzt kopieren, danach nicht mehr abrufbar:
            </p>
            <div className="space-y-1">
              <Label className="text-xs">MCP-Endpoint</Label>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {issued.mcp_url}
              </code>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bearer-Token</Label>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {issued.token}
              </code>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={issued.token} label="Token kopieren" />
              <CopyButton value={issued.mcp_url} label="URL kopieren" />
              <Button type="button" size="sm" variant="ghost" onClick={() => setIssued(null)}>
                Schließen
              </Button>
            </div>
          </div>
        ) : null}

        {/* Issue form */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1 space-y-1">
            <Label htmlFor="mcp-token-label" className="text-xs">
              Bezeichnung (optional)
            </Label>
            <Input
              id="mcp-token-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z. B. Claude Desktop"
              maxLength={120}
            />
          </div>
          <div className="w-32 space-y-1">
            <Label htmlFor="mcp-token-expiry" className="text-xs">
              Ablauf (Tage)
            </Label>
            <Input
              id="mcp-token-expiry"
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              placeholder="∞"
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
          <p className="text-xs text-muted-foreground">Noch keine MCP-Tokens.</p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => {
              const state = tokenState(t)
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
                      {state === "revoked" ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          widerrufen
                        </Badge>
                      ) : state === "expired" ? (
                        <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
                          abgelaufen
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
                      {t.expires_at
                        ? ` · läuft ab ${new Date(t.expires_at).toLocaleDateString("de-DE")}`
                        : ""}
                    </p>
                  </div>
                  {state !== "revoked" ? (
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

        {/* Recent tool-call audit */}
        {!loading && calls.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h4 className="text-xs font-medium">Letzte Tool-Aufrufe</h4>
            </div>
            <ul className="space-y-1">
              {calls.slice(0, 10).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                >
                  <span className="truncate font-mono">{c.tool_name}</span>
                  <span className="flex flex-shrink-0 items-center gap-2 text-muted-foreground">
                    <span className={STATUS_TONE[c.status] ?? ""}>{c.status}</span>
                    {c.redaction_count != null && c.redaction_count > 0 ? (
                      <span>· {c.redaction_count} redacted</span>
                    ) : null}
                    {c.latency_ms != null ? <span>· {c.latency_ms} ms</span> : null}
                    <span>· {new Date(c.created_at).toLocaleTimeString("de-DE")}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
