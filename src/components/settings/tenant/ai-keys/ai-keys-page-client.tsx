"use client"

import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react"
import * as React from "react"

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"
import { toast } from "sonner"

interface KeyState {
  status: "not_set" | "valid" | "invalid" | "unknown"
  provider: string
  fingerprint?: string
  last_validated_at?: string | null
  last_validation_status?: string | null
  created_at?: string | null
  updated_at?: string | null
  validation_warning?: string | null
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: KeyState }
  | { kind: "error"; message: string }

const PROVIDER = "anthropic"

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  } catch {
    return iso
  }
}

export function AiKeysPageClient() {
  const { currentTenant, currentRole } = useAuth()
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [editing, setEditing] = React.useState(false)
  const [keyInput, setKeyInput] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [validating, setValidating] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const tenantId = currentTenant?.id ?? null
  const [reloadCounter, setReloadCounter] = React.useState(0)
  const reload = React.useCallback(() => {
    setReloadCounter((n) => n + 1)
  }, [])

  React.useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    fetch(`/api/tenants/${tenantId}/ai-keys/${PROVIDER}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
        }
        return (await r.json()) as KeyState
      })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      })
    return () => {
      cancelled = true
    }
  }, [tenantId, reloadCounter])

  if (!currentTenant) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade Workspace …
      </div>
    )
  }

  if (currentRole !== "admin") {
    return (
      <Alert>
        <AlertTitle>Nur für Tenant-Admins</AlertTitle>
        <AlertDescription>
          AI-Keys können nur von Tenant-Admins verwaltet werden.
        </AlertDescription>
      </Alert>
    )
  }

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade …
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden />
        <AlertTitle>Fehler beim Laden</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  const data = state.data
  const isSet = data.status !== "not_set"

  // Client-side key-shape validation (mirrors server Zod schema).
  const trimmed = keyInput.trim()
  const keyShapeOk =
    trimmed.length >= 30 &&
    trimmed.length <= 500 &&
    trimmed.startsWith("sk-ant-")

  async function handleSave() {
    if (!tenantId || !keyShapeOk) return
    setSubmitting(true)
    try {
      const r = await fetch(`/api/tenants/${tenantId}/ai-keys/${PROVIDER}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as KeyState
      if (result.status === "valid") {
        toast.success("Anthropic-Key gespeichert und validiert.")
      } else if (result.status === "unknown") {
        toast.warning(
          result.validation_warning ??
            "Key gespeichert, Validierung steht aus.",
        )
      } else {
        toast.warning("Key gespeichert, aber nicht valide.")
      }
      setKeyInput("")
      setEditing(false)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleValidate() {
    if (!tenantId) return
    setValidating(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-keys/${PROVIDER}/validate`,
        { method: "POST" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as KeyState
      if (result.status === "valid") {
        toast.success("Key ist valide.")
      } else if (result.status === "invalid") {
        toast.error("Key ist nicht valide. Bitte rotieren.")
      } else {
        toast.warning("Validierung unvollständig — Anthropic nicht erreichbar.")
      }
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-Test fehlgeschlagen")
    } finally {
      setValidating(false)
    }
  }

  async function handleDelete() {
    if (!tenantId) return
    setSubmitting(true)
    try {
      const r = await fetch(`/api/tenants/${tenantId}/ai-keys/${PROVIDER}`, {
        method: "DELETE",
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success("Key gelöscht.")
      setDeleteOpen(false)
      setEditing(false)
      setKeyInput("")
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          AI-Provider-Keys
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hinterlegen Sie pro Provider Ihren eigenen API-Key. Class-3-Daten
          werden nur extern verarbeitet wenn ein Tenant-Key gesetzt ist.
        </p>
      </div>

      <Alert>
        <KeyRound className="h-4 w-4" aria-hidden />
        <AlertTitle>Class-3 nur mit Tenant-Key</AlertTitle>
        <AlertDescription>
          Ohne hinterlegten Anthropic-Key bleiben Class-3-Daten lokal (kein
          externer Call). Class-1 / Class-2 nutzen den Plattform-Key als
          Fallback. Tenant-Keys werden verschlüsselt gespeichert und niemals
          zurückgegeben — vergessene Keys müssen bei Anthropic neu generiert
          und rotiert werden.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                Anthropic{" "}
                <StatusBadge status={data.status} />
              </CardTitle>
              <CardDescription>
                Claude-Modelle (claude-opus-4-7) für Risiken, Narratives und
                weitere AI-Purposes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {isSet && data.fingerprint && (
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Fingerprint</dt>
                <dd className="font-mono">{data.fingerprint}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Letzte Validierung</dt>
                <dd>{formatTimestamp(data.last_validated_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{data.last_validation_status ?? "—"}</dd>
              </div>
            </dl>
          )}

          {data.status === "invalid" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>Letzte Validierung fehlgeschlagen</AlertTitle>
              <AlertDescription>
                Anthropic hat den Key abgelehnt. Bitte rotieren oder löschen.
              </AlertDescription>
            </Alert>
          )}

          {data.status === "unknown" && isSet && (
            <Alert>
              <HelpCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>Validierung steht aus</AlertTitle>
              <AlertDescription>
                Der Key konnte beim Speichern nicht final validiert werden
                (Timeout / Anthropic temporär nicht erreichbar). Bitte
                Re-Test ausführen.
              </AlertDescription>
            </Alert>
          )}

          {(editing || !isSet) && (
            <div className="space-y-2">
              <Label htmlFor="anthropic-key">Anthropic API-Key</Label>
              <Input
                id="anthropic-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-api03-…"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Muss mit <code className="font-mono">sk-ant-</code> beginnen
                und mindestens 30 Zeichen haben.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSave}
                  disabled={!keyShapeOk || submitting}
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  )}
                  Speichern + Validieren
                </Button>
                {editing && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(false)
                      setKeyInput("")
                    }}
                    disabled={submitting}
                  >
                    Abbrechen
                  </Button>
                )}
              </div>
            </div>
          )}

          {isSet && !editing && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleValidate}
                disabled={validating}
              >
                {validating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                )}
                Re-Test
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Rotieren
              </Button>
              <Button
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                Löschen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Key wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Nach dem Löschen werden Class-3-Anfragen sofort blockiert
              (kein externer Call mehr). Class-1/2-Anfragen nutzen den
              Plattform-Key als Fallback. Diese Aktion ist nicht
              rückgängig — der Audit-Log behält den Vorgang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatusBadge({ status }: { status: KeyState["status"] }) {
  if (status === "valid") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> valid
      </Badge>
    )
  }
  if (status === "invalid") {
    return (
      <Badge variant="destructive">
        <AlertCircle className="mr-1 h-3 w-3" aria-hidden /> invalid
      </Badge>
    )
  }
  if (status === "unknown") {
    return (
      <Badge variant="secondary">
        <HelpCircle className="mr-1 h-3 w-3" aria-hidden /> unknown
      </Badge>
    )
  }
  return <Badge variant="outline">nicht gesetzt</Badge>
}
