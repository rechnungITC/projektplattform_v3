"use client"

import {
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  KeyRound,
  Loader2,
  PlugZap,
  ServerCog,
  Trash2,
  WifiOff,
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

import { CostCapSection } from "./cost-cap-section"
import { PriorityMatrixSection } from "./priority-matrix-section"

type ProviderName = "anthropic" | "ollama" | "openai" | "google"

type ProviderStatus =
  | "not_set"
  | "valid"
  | "invalid"
  | "unreachable"
  | "model_missing"
  | "unknown"

interface ProviderState {
  status: ProviderStatus
  provider: ProviderName
  fingerprint?: string
  last_validated_at?: string | null
  last_validation_status?: string | null
  created_at?: string | null
  updated_at?: string | null
  validation_warning?: string | null
}

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready"
      anthropic: ProviderState
      openai: ProviderState
      google: ProviderState
      ollama: ProviderState
    }
  | { kind: "error"; message: string }

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

export function AiProvidersPageClient() {
  const { currentTenant, currentRole } = useAuth()
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })
  const [reloadCounter, setReloadCounter] = React.useState(0)
  const reload = React.useCallback(() => {
    setReloadCounter((n) => n + 1)
  }, [])

  const tenantId = currentTenant?.id ?? null

  React.useEffect(() => {
    if (!tenantId) return
    let cancelled = false

    async function loadProvider(p: ProviderName): Promise<ProviderState> {
      const r = await fetch(`/api/tenants/${tenantId}/ai-providers/${p}`, {
        cache: "no-store",
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      return (await r.json()) as ProviderState
    }

    Promise.all([
      loadProvider("anthropic"),
      loadProvider("openai"),
      loadProvider("google"),
      loadProvider("ollama"),
    ])
      .then(([anthropic, openai, google, ollama]) => {
        if (!cancelled) {
          setState({ kind: "ready", anthropic, openai, google, ollama })
        }
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
          AI-Provider können nur von Tenant-Admins verwaltet werden.
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI-Provider</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hinterlegen Sie eigene API-Keys oder Endpoints. Class-3-Daten werden
          nur lokal über einen tenant-eigenen Ollama-Endpoint verarbeitet —
          niemals über Cloud-Provider.
        </p>
      </div>

      <Alert>
        <KeyRound className="h-4 w-4" aria-hidden />
        <AlertTitle>Class-3 nur über lokalen Provider (Ollama)</AlertTitle>
        <AlertDescription>
          Für sensible Daten (Class-3, z.B. personenbezogene Felder) muss ein
          eigener Ollama-Endpoint hinterlegt sein. Cloud-Provider wie
          Anthropic werden für Class-3 strikt blockiert. Class-1/Class-2-Daten
          dürfen über Anthropic laufen — sowohl mit Tenant-Key als auch mit
          dem Plattform-Fallback-Key.
        </AlertDescription>
      </Alert>

      <AnthropicCard
        state={state.anthropic}
        tenantId={tenantId!}
        onChanged={reload}
      />

      <CloudKeyCard
        provider="openai"
        title="OpenAI"
        description="GPT-4o + andere OpenAI-Modelle für Class-1 / Class-2-Daten. Cloud-Provider — nicht für Class-3 erlaubt."
        keyPrefix="sk-"
        keyExample="sk-proj-…"
        keyHint="Muss mit sk- beginnen und mindestens 20 Zeichen haben."
        deleteImpactText="Class-1/Class-2-Anfragen routen anschließend zum nächsten Cloud-Provider in der Priority-Matrix oder zum Plattform-Fallback."
        state={state.openai}
        tenantId={tenantId!}
        onChanged={reload}
      />

      <CloudKeyCard
        provider="google"
        title="Google AI Studio (Gemini)"
        description="Gemini-Modelle (gemini-2.0-flash-exp) für Class-1 / Class-2-Daten. Cloud-Provider — nicht für Class-3 erlaubt."
        keyPrefix="AIza"
        keyExample="AIza…"
        keyHint="Muss mit AIza beginnen (Gemini API key, kein Vertex-AI Service-Account)."
        deleteImpactText="Class-1/Class-2-Anfragen routen anschließend zum nächsten Cloud-Provider in der Priority-Matrix oder zum Plattform-Fallback."
        state={state.google}
        tenantId={tenantId!}
        onChanged={reload}
      />

      <OllamaCard state={state.ollama} tenantId={tenantId!} onChanged={reload} />

      <PriorityMatrixSection
        tenantId={tenantId!}
        anthropicAvailable={state.anthropic.status !== "not_set"}
        openaiAvailable={state.openai.status !== "not_set"}
        googleAvailable={state.google.status !== "not_set"}
        ollamaAvailable={state.ollama.status !== "not_set"}
      />

      <CostCapSection tenantId={tenantId!} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Anthropic Card
// ---------------------------------------------------------------------------

function AnthropicCard({
  state,
  tenantId,
  onChanged,
}: {
  state: ProviderState
  tenantId: string
  onChanged: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [keyInput, setKeyInput] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [validating, setValidating] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const isSet = state.status !== "not_set"
  const trimmed = keyInput.trim()
  const keyShapeOk =
    trimmed.length >= 30 &&
    trimmed.length <= 500 &&
    trimmed.startsWith("sk-ant-")

  async function handleSave() {
    if (!keyShapeOk) return
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/anthropic`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as ProviderState
      if (result.status === "valid")
        toast.success("Anthropic-Key gespeichert und validiert.")
      else if (result.status === "unknown")
        toast.warning(
          result.validation_warning ??
            "Key gespeichert, Validierung steht aus.",
        )
      else toast.warning("Key gespeichert, aber nicht valide.")
      setKeyInput("")
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/anthropic/validate`,
        { method: "POST" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as ProviderState
      if (result.status === "valid") toast.success("Key ist valide.")
      else if (result.status === "invalid")
        toast.error("Key ist nicht valide. Bitte rotieren.")
      else toast.warning("Validierung unvollständig — Anthropic nicht erreichbar.")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-Test fehlgeschlagen")
    } finally {
      setValidating(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/anthropic`,
        { method: "DELETE" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success("Anthropic-Key gelöscht.")
      setDeleteOpen(false)
      setEditing(false)
      setKeyInput("")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden />
          Anthropic <StatusBadge status={state.status} />
        </CardTitle>
        <CardDescription>
          Claude-Modelle (claude-opus-4-7) für Class-1 / Class-2-Daten.
          Cloud-Provider — nicht für Class-3 erlaubt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSet && state.fingerprint && (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Fingerprint</dt>
              <dd className="font-mono">{state.fingerprint}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Letzte Validierung</dt>
              <dd>{formatTimestamp(state.last_validated_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{state.last_validation_status ?? "—"}</dd>
            </div>
          </dl>
        )}

        {state.status === "invalid" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Letzte Validierung fehlgeschlagen</AlertTitle>
            <AlertDescription>
              Anthropic hat den Key abgelehnt. Bitte rotieren oder löschen.
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
              <Button onClick={handleSave} disabled={!keyShapeOk || submitting}>
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
            <Button variant="outline" onClick={handleValidate} disabled={validating}>
              {validating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Re-Test
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Rotieren
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Löschen
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anthropic-Key löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Class-1/Class-2-Anfragen fallen anschließend auf den
              Plattform-Anthropic-Key zurück (sofern vorhanden), sonst werden
              sie blockiert. Diese Aktion ist nicht rückgängig — der
              Audit-Log behält den Vorgang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
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
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Ollama Card
// ---------------------------------------------------------------------------

interface OllamaInputs {
  endpoint_url: string
  model_id: string
  bearer_token: string
}

function OllamaCard({
  state,
  tenantId,
  onChanged,
}: {
  state: ProviderState
  tenantId: string
  onChanged: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [inputs, setInputs] = React.useState<OllamaInputs>({
    endpoint_url: "",
    model_id: "",
    bearer_token: "",
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [validating, setValidating] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const isSet = state.status !== "not_set"

  const trimmed = {
    endpoint_url: inputs.endpoint_url.trim(),
    model_id: inputs.model_id.trim(),
    bearer_token: inputs.bearer_token.trim(),
  }
  const isHttp = /^http:\/\//i.test(trimmed.endpoint_url)
  const shapeOk =
    /^https?:\/\/[^\s]{3,}/i.test(trimmed.endpoint_url) &&
    trimmed.model_id.length > 0 &&
    (trimmed.bearer_token.length === 0 || trimmed.bearer_token.length >= 8)

  async function handleSave() {
    if (!shapeOk) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        endpoint_url: trimmed.endpoint_url,
        model_id: trimmed.model_id,
      }
      if (trimmed.bearer_token) body.bearer_token = trimmed.bearer_token

      const r = await fetch(`/api/tenants/${tenantId}/ai-providers/ollama`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const respBody = await r.json().catch(() => ({}))
        throw new Error(respBody?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as ProviderState
      if (result.status === "valid")
        toast.success("Ollama-Endpoint gespeichert und validiert.")
      else if (result.status === "model_missing")
        toast.warning(
          result.validation_warning ??
            `Endpoint OK, aber Modell '${trimmed.model_id}' fehlt. Auf dem Ollama-Server: ollama pull ${trimmed.model_id}`,
        )
      else if (result.status === "unreachable")
        toast.warning(
          "Endpoint nicht erreichbar — Konfig gespeichert. Re-Test wenn online.",
        )
      else toast.warning("Endpoint gespeichert mit unklarem Status.")
      setInputs({ endpoint_url: "", model_id: "", bearer_token: "" })
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/ollama/validate`,
        { method: "POST" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as ProviderState
      if (result.status === "valid")
        toast.success("Endpoint OK + Modell vorhanden.")
      else if (result.status === "invalid")
        toast.error("Bearer-Token wurde abgelehnt.")
      else if (result.status === "model_missing")
        toast.warning("Modell fehlt — bitte pullen.")
      else if (result.status === "unreachable")
        toast.warning("Endpoint nicht erreichbar.")
      else toast.warning("Validierung unvollständig.")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-Test fehlgeschlagen")
    } finally {
      setValidating(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    try {
      const r = await fetch(`/api/tenants/${tenantId}/ai-providers/ollama`, {
        method: "DELETE",
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success("Ollama-Endpoint gelöscht.")
      setDeleteOpen(false)
      setEditing(false)
      setInputs({ endpoint_url: "", model_id: "", bearer_token: "" })
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ServerCog className="h-5 w-5" aria-hidden />
          Ollama (lokal) <StatusBadge status={state.status} />
        </CardTitle>
        <CardDescription>
          Self-hosted Ollama-Endpoint auf eigener Infrastruktur. Class-3-fähig
          — Daten verlassen Ihre Infrastruktur nicht.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSet && state.fingerprint && (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Endpoint / Modell</dt>
              <dd className="font-mono break-all">{state.fingerprint}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Letzte Validierung</dt>
              <dd>{formatTimestamp(state.last_validated_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{state.last_validation_status ?? "—"}</dd>
            </div>
          </dl>
        )}

        {state.status === "model_missing" && (
          <Alert>
            <PlugZap className="h-4 w-4" aria-hidden />
            <AlertTitle>Modell fehlt</AlertTitle>
            <AlertDescription>
              Endpoint ist erreichbar, aber das gewünschte Modell ist nicht
              gepullt. Auf dem Ollama-Server ausführen:{" "}
              <code className="font-mono">ollama pull &lt;model&gt;</code>
            </AlertDescription>
          </Alert>
        )}

        {state.status === "unreachable" && (
          <Alert>
            <WifiOff className="h-4 w-4" aria-hidden />
            <AlertTitle>Endpoint nicht erreichbar</AlertTitle>
            <AlertDescription>
              Konfiguration ist gespeichert, aber der Endpoint antwortet
              nicht (Timeout / DNS / Connection-Refused). Re-Test ausführen
              wenn der Server wieder online ist.
            </AlertDescription>
          </Alert>
        )}

        {state.status === "invalid" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Bearer-Token ungültig</AlertTitle>
            <AlertDescription>
              Der Endpoint hat den Bearer-Token abgelehnt. Bitte rotieren.
            </AlertDescription>
          </Alert>
        )}

        {(editing || !isSet) && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ollama-endpoint">Endpoint-URL</Label>
              <Input
                id="ollama-endpoint"
                placeholder="https://ollama.example.com"
                value={inputs.endpoint_url}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, endpoint_url: e.target.value }))
                }
                disabled={submitting}
              />
              {isHttp && (
                <p className="text-xs text-warning">
                  HTTP-Endpoint — Daten werden unverschlüsselt übertragen.
                  Nur für interne / private Netzwerke geeignet.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ollama-model">Modell</Label>
              <Input
                id="ollama-model"
                placeholder="llama3.1:70b"
                value={inputs.model_id}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, model_id: e.target.value }))
                }
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Muss auf dem Ollama-Server bereits gepullt sein
                (<code className="font-mono">ollama pull …</code>).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ollama-bearer">Bearer-Token (optional)</Label>
              <Input
                id="ollama-bearer"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="leer lassen wenn nicht hinter Auth-Proxy"
                value={inputs.bearer_token}
                onChange={(e) =>
                  setInputs((s) => ({ ...s, bearer_token: e.target.value }))
                }
                disabled={submitting}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={!shapeOk || submitting}>
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
                    setInputs({
                      endpoint_url: "",
                      model_id: "",
                      bearer_token: "",
                    })
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
            <Button variant="outline" onClick={handleValidate} disabled={validating}>
              {validating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Re-Test
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Löschen
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ollama-Endpoint löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Class-3-Anfragen werden anschließend blockiert (kein lokaler
              Provider mehr). Class-1/Class-2 fallen auf Anthropic /
              Plattform-Key zurück. Audit-Log behält den Vorgang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
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
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Generic cloud-provider Card (used for OpenAI + Google — same shape as
// Anthropic but parameterized prefix / labels). Anthropic stays as its
// own component because of historical separation; could be unified later.
// ---------------------------------------------------------------------------

function CloudKeyCard({
  provider,
  title,
  description,
  keyPrefix,
  keyExample,
  keyHint,
  deleteImpactText,
  state,
  tenantId,
  onChanged,
}: {
  provider: "openai" | "google"
  title: string
  description: string
  keyPrefix: string
  keyExample: string
  keyHint: string
  deleteImpactText: string
  state: ProviderState
  tenantId: string
  onChanged: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [keyInput, setKeyInput] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [validating, setValidating] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const isSet = state.status !== "not_set"
  const trimmed = keyInput.trim()
  const keyShapeOk =
    trimmed.length >= 20 &&
    trimmed.length <= 500 &&
    trimmed.startsWith(keyPrefix)

  async function handleSave() {
    if (!keyShapeOk) return
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/${provider}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as ProviderState
      if (result.status === "valid") {
        toast.success(`${title}-Key gespeichert und validiert.`)
      } else if (result.status === "unknown") {
        toast.warning(
          result.validation_warning ??
            `${title}-Key gespeichert, Validierung steht aus.`,
        )
      } else {
        toast.warning(`${title}-Key gespeichert, aber nicht valide.`)
      }
      setKeyInput("")
      setEditing(false)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/${provider}/validate`,
        { method: "POST" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      const result = (await r.json()) as ProviderState
      if (result.status === "valid") toast.success(`${title}-Key ist valide.`)
      else if (result.status === "invalid")
        toast.error(`${title}-Key ist nicht valide. Bitte rotieren.`)
      else toast.warning(`Validierung unvollständig — ${title} nicht erreichbar.`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-Test fehlgeschlagen")
    } finally {
      setValidating(false)
    }
  }

  async function handleDelete() {
    setSubmitting(true)
    try {
      const r = await fetch(
        `/api/tenants/${tenantId}/ai-providers/${provider}`,
        { method: "DELETE" },
      )
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `HTTP ${r.status}`)
      }
      toast.success(`${title}-Key gelöscht.`)
      setDeleteOpen(false)
      setEditing(false)
      setKeyInput("")
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden />
          {title} <StatusBadge status={state.status} />
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSet && state.fingerprint && (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Fingerprint</dt>
              <dd className="font-mono">{state.fingerprint}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Letzte Validierung</dt>
              <dd>{formatTimestamp(state.last_validated_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{state.last_validation_status ?? "—"}</dd>
            </div>
          </dl>
        )}

        {state.status === "invalid" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertTitle>Letzte Validierung fehlgeschlagen</AlertTitle>
            <AlertDescription>
              {title} hat den Key abgelehnt. Bitte rotieren oder löschen.
            </AlertDescription>
          </Alert>
        )}

        {(editing || !isSet) && (
          <div className="space-y-2">
            <Label htmlFor={`${provider}-key`}>{title} API-Key</Label>
            <Input
              id={`${provider}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={keyExample}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">{keyHint}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={!keyShapeOk || submitting}>
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
            <Button variant="outline" onClick={handleValidate} disabled={validating}>
              {validating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Re-Test
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Rotieren
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Löschen
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}-Key löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteImpactText} Diese Aktion ist nicht rückgängig — der
              Audit-Log behält den Vorgang.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
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
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === "valid")
    return (
      <Badge className="bg-success/15 text-success hover:bg-success/15">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden /> valid
      </Badge>
    )
  if (status === "invalid")
    return (
      <Badge variant="destructive">
        <AlertCircle className="mr-1 h-3 w-3" aria-hidden /> invalid
      </Badge>
    )
  if (status === "unreachable")
    return (
      <Badge variant="secondary">
        <WifiOff className="mr-1 h-3 w-3" aria-hidden /> unreachable
      </Badge>
    )
  if (status === "model_missing")
    return (
      <Badge variant="secondary">
        <PlugZap className="mr-1 h-3 w-3" aria-hidden /> model missing
      </Badge>
    )
  if (status === "unknown")
    return (
      <Badge variant="secondary">
        <HelpCircle className="mr-1 h-3 w-3" aria-hidden /> unknown
      </Badge>
    )
  return <Badge variant="outline">nicht gesetzt</Badge>
}
