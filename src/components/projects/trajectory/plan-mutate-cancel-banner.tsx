"use client"

/**
 * PROJ-65 ε.3c.γ — Cancel-state banner inside PlanMutateDialog.
 *
 * Rendered when the user aborts client-side pagination (via ESC or
 * Cancel button) or via the soft-limit pause banner's "Hier abbrechen".
 * The diff table is intentionally NOT shown — Cancel is discard-state
 * (G4-(a) Discard, L30 atomicity preserved).
 */

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { XCircle } from "lucide-react"

interface PlanMutateCancelBannerProps {
  /** Re-run the full mutation flow (re-fetch from server). */
  onRetry: () => void
  /** Close the dialog without retrying. */
  onClose: () => void
}

export function PlanMutateCancelBanner({
  onRetry,
  onClose,
}: PlanMutateCancelBannerProps) {
  return (
    <Alert
      variant="destructive"
      data-testid="plan-mutate-cancel-banner"
      role="alert"
    >
      <XCircle className="h-4 w-4" aria-hidden />
      <AlertTitle>Plan-Mutate-Vorschau abgebrochen</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm">
          Die Plan-Mutate-Vorschau wurde unterbrochen. Bitte erneut versuchen
          oder die Auswahl verkleinern.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={onRetry}
            data-testid="plan-mutate-cancel-retry"
          >
            Erneut versuchen
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            data-testid="plan-mutate-cancel-close"
          >
            Schließen
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
