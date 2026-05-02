"use client"

import { Loader2 } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useAuth } from "@/hooks/use-auth"
import {
  fetchRiskScoreSettings,
  type RiskScoreSettings,
} from "@/lib/risk-score/api"

import {
  buildInitialFormState,
  formStateToOverrides,
  mergeFormPreview,
  type FormState,
} from "./form-state"
import { RiskScoreForm } from "./risk-score-form"
import { RiskScorePreview } from "./risk-score-preview"

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: RiskScoreSettings; formState: FormState }
  | { kind: "error"; message: string }

export function RiskScorePageClient() {
  const { currentTenant, currentRole } = useAuth()
  const [state, setState] = React.useState<LoadState>({ kind: "loading" })

  const tenantId = currentTenant?.id ?? null

  React.useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    fetchRiskScoreSettings(tenantId)
      .then((data) => {
        if (!cancelled) {
          setState({
            kind: "ready",
            data,
            formState: buildInitialFormState(data),
          })
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
  }, [tenantId])

  // Bug-3 fix: live-preview consumes the same form-state as the form. Effective
  // config is computed from current form-state on every keystroke (sub-ms cost).
  const livePreviewConfig = React.useMemo(() => {
    if (state.kind !== "ready") return null
    return mergeFormPreview(
      state.data.defaults,
      formStateToOverrides(state.formState),
    )
  }, [state])

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
          Die Konfiguration der Risk-Score-Multiplikatoren erfordert Admin-Rechte.
          Wenden Sie sich an Ihren Workspace-Admin.
        </AlertDescription>
      </Alert>
    )
  }

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Lade Konfiguration …
      </div>
    )
  }

  if (state.kind === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Konnte Konfiguration nicht laden</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  const setFormState: React.Dispatch<React.SetStateAction<FormState>> = (
    update,
  ) => {
    setState((prev) => {
      if (prev.kind !== "ready") return prev
      const next =
        typeof update === "function" ? update(prev.formState) : update
      return { ...prev, formState: next }
    })
  }

  const onSettingsChanged = (next: RiskScoreSettings) => {
    setState({
      kind: "ready",
      data: next,
      formState: buildInitialFormState(next),
    })
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Risk-Score-Konfiguration
        </h1>
        <p className="text-sm text-muted-foreground">
          Multiplikatoren für die Stakeholder-Risiko-Berechnung. Defaults sind
          allgemeingültig; Tenant-Anpassungen wirken nur in diesem Workspace.
          Werte außerhalb 0..10 werden abgewiesen.
        </p>
      </header>

      {livePreviewConfig && (
        <RiskScorePreview effectiveConfig={livePreviewConfig} />
      )}

      <RiskScoreForm
        tenantId={currentTenant.id}
        defaults={state.data.defaults}
        formState={state.formState}
        setFormState={setFormState}
        onSettingsChanged={onSettingsChanged}
      />
    </div>
  )
}
