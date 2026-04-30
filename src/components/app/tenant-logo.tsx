"use client"

import Image from "next/image"
import * as React from "react"

import { cn } from "@/lib/utils"

interface TenantLogoProps {
  logoUrl: string | null
  tenantName: string | null
  /** Compact rendering — only the avatar/initial circle, no text. */
  compact?: boolean
  className?: string
}

/**
 * Small logo + tenant-name component used in the global sidebar header.
 *
 * Falls back to a 2-letter initial avatar when no logo URL is set.
 * Logo URLs are validated upstream (PROJ-17 only stores https URLs).
 */
export function TenantLogo({
  logoUrl,
  tenantName,
  compact = false,
  className,
}: TenantLogoProps) {
  const safeName = tenantName?.trim() || "Plattform"
  const initials = React.useMemo(() => {
    const parts = safeName.split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "P"
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }, [safeName])

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={safeName}
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            unoptimized
          />
        ) : (
          <span className="text-xs font-semibold tracking-tight text-foreground">
            {initials}
          </span>
        )}
      </div>
      {compact ? null : (
        <span className="truncate text-sm font-medium">{safeName}</span>
      )}
    </div>
  )
}
