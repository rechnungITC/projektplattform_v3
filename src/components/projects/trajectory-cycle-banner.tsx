"use client"

/**
 * PROJ-65 ε.1 — Cycle-Detected sticky banner (L5).
 */

import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"

interface CycleBannerProps {
  cycleCount: number
  projectId: string
}

export function CycleBanner({ cycleCount, projectId }: CycleBannerProps) {
  if (cycleCount === 0) return null
  return (
    <div
      role="status"
      data-testid="trajectory-cycle-banner"
      className="flex items-center justify-between gap-3 rounded-md border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2"
    >
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <span>
          {cycleCount === 1
            ? "1 zyklische Abhängigkeit"
            : `${cycleCount} zyklische Abhängigkeiten`}{" "}
          ausgeblendet
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        asChild
        className="text-xs"
      >
        <Link href={`/projects/${encodeURIComponent(projectId)}/dependencies`}>
          Details
        </Link>
      </Button>
    </div>
  )
}
