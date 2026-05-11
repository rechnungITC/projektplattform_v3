"use client"

import { AlertTriangle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface DashboardSectionErrorProps {
  title: string
  message?: string | null
  onRetry?: () => void | Promise<void>
}

/**
 * PROJ-64 — section-level error placeholder.
 *
 * AC-9: a single failed rollup must not blank the dashboard. Each
 * panel renders this card in place of its content when its
 * `DashboardSectionEnvelope.state === 'error'`.
 */
export function DashboardSectionError({
  title,
  message,
  onRetry,
}: DashboardSectionErrorProps) {
  return (
    <Card role="alert" aria-live="polite" className="border-destructive/40">
      <CardContent className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              {title} konnte nicht geladen werden
            </p>
            <p className="text-xs text-muted-foreground">
              {message ?? "Ein unbekannter Fehler ist aufgetreten."}
            </p>
          </div>
        </div>
        {onRetry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void onRetry()
            }}
            className="self-start sm:self-auto"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
            Erneut laden
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
