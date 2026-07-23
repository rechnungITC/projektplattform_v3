"use client"

/**
 * PROJ-79-α — tenant storage-quota bar for the Dokumente tab header.
 * Amber at ≥ soft_warning_pct, red at ≥ 100%. Quota is per tenant.
 */

import { HardDrive } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import { formatBytes } from "@/lib/dms/format"
import { cn } from "@/lib/utils"
import type { QuotaStatus } from "@/types/dms"

export function DmsQuotaBar({ quota }: { quota: QuotaStatus | null }) {
  if (!quota) return null
  const pct = Math.min(quota.pct_used, 100)
  const over = quota.pct_used >= 100
  const warn = quota.over_soft_warning

  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <HardDrive className="h-3.5 w-3.5" aria-hidden />
        <span>
          {formatBytes(quota.current_usage_bytes)} / {formatBytes(quota.max_bytes)}
        </span>
        <span className="ml-auto tabular-nums">{quota.pct_used}%</span>
      </div>
      <Progress
        value={pct}
        aria-label={`Speicherauslastung ${quota.pct_used}%`}
        className={cn(
          "h-2",
          over
            ? "[&>*]:bg-red-500"
            : warn
              ? "[&>*]:bg-amber-500"
              : undefined,
        )}
      />
      {over ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          Kontingent erschöpft — Uploads werden abgelehnt.
        </p>
      ) : warn ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
          Kontingent fast erschöpft.
        </p>
      ) : null}
    </div>
  )
}
