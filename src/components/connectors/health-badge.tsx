"use client"

import { AlertTriangle, CheckCircle2, CircleDashed, Construction } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { ConnectorHealth } from "@/lib/connectors/types"

interface HealthBadgeProps {
  health: ConnectorHealth
}

const LABELS: Record<ConnectorHealth["status"], string> = {
  adapter_missing: "Adapter folgt",
  adapter_ready_unconfigured: "Bereit, nicht konfiguriert",
  adapter_ready_configured: "Aktiv",
  error: "Fehler",
  unconfigured: "Nicht konfiguriert",
}

export function HealthBadge({ health }: HealthBadgeProps) {
  switch (health.status) {
    case "adapter_ready_configured":
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          {LABELS[health.status]}
        </Badge>
      )
    case "adapter_ready_unconfigured":
    case "unconfigured":
      return (
        <Badge variant="secondary" className="gap-1">
          <CircleDashed className="h-3 w-3" aria-hidden />
          {LABELS[health.status]}
        </Badge>
      )
    case "adapter_missing":
      return (
        <Badge variant="outline" className="gap-1">
          <Construction className="h-3 w-3" aria-hidden />
          {LABELS[health.status]}
        </Badge>
      )
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {LABELS[health.status]}
        </Badge>
      )
  }
}
