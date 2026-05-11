"use client"

import { ExternalLink, Lock } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface CrossProjectLinkBadgeProps {
  /** ID of the project the link targets. */
  targetProjectId: string
  /** Display name of the project — null when the caller can't read it. */
  targetProjectName: string | null
  /** True when caller has at least project-view access. */
  accessible: boolean
  /** When true, the badge is rendered without project context (= same project). */
  hideWhenSame?: boolean
  /** Project id of the current room — used to decide hideWhenSame. */
  currentProjectId?: string
  className?: string
}

/**
 * PROJ-27 Designer § 6 — three-state badge.
 * - Same project → omitted (parent must call with hideWhenSame).
 * - Accessible cross-project → clickable, primary-tinted link.
 * - Inaccessible cross-project → locked + Tooltip, no link.
 */
export function CrossProjectLinkBadge({
  targetProjectId,
  targetProjectName,
  accessible,
  hideWhenSame = true,
  currentProjectId,
  className,
}: CrossProjectLinkBadgeProps) {
  if (
    hideWhenSame &&
    currentProjectId &&
    currentProjectId === targetProjectId
  ) {
    return null
  }

  if (!accessible) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "inline-flex items-center gap-1 border-dashed text-on-surface-variant",
                className,
              )}
              aria-label="Verknüpft mit Item in nicht zugänglichem Projekt"
            >
              <Lock className="h-3 w-3" aria-hidden />
              Nicht zugänglich
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">
            Du bist kein Mitglied dieses Projekts. Frage den Lead um eine
            Einladung.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <Link
      href={`/projects/${targetProjectId}`}
      className="inline-flex"
      aria-label={`Zu Projekt ${targetProjectName ?? "wechseln"}`}
    >
      <Badge
        variant="secondary"
        className={cn(
          "inline-flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/15",
          className,
        )}
      >
        <ExternalLink className="h-3 w-3" aria-hidden />
        <span className="truncate max-w-[10rem]">
          {targetProjectName ?? "Projekt"}
        </span>
      </Badge>
    </Link>
  )
}
