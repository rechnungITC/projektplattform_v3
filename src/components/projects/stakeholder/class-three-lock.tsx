"use client"

/**
 * PROJ-65 ε.2 — Class-3 lock glyph + footnote helpers (FE-8, FE-18).
 *
 * Lock-Glyph shows the user whether they currently see Class-3
 * plaintext (lock_open) or masked aggregates (lock). UI rendering
 * is purely additive — the actual masking happens server-side.
 */

import { Lock, LockOpen } from "lucide-react"
import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface ClassThreeLockProps {
  /** True when the user has Klartext-Permission. */
  clearView: boolean
  /** Optional aria-label override. */
  ariaLabel?: string
}

export function ClassThreeLock({
  clearView,
  ariaLabel,
}: ClassThreeLockProps) {
  const label =
    ariaLabel ??
    (clearView
      ? "Kostendaten sichtbar (Klartext)"
      : "Kostendaten maskiert (Class-3)")
  const Icon = clearView ? LockOpen : Lock

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground"
          data-testid="class-three-lock"
        >
          <Icon className="h-3 w-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">
        Class-3-Masking — Sichtbarkeit gemäß Projektberechtigung.
      </TooltipContent>
    </Tooltip>
  )
}

interface ClassThreeFootnoteProps {
  /** True when at least one masked value is rendered in the surrounding panel/dialog. */
  hasMaskedValue: boolean
  /** Project id for prefilled mailto link. */
  projectId: string
}

export function ClassThreeFootnote({
  hasMaskedValue,
  projectId,
}: ClassThreeFootnoteProps) {
  if (!hasMaskedValue) return null
  const subject = encodeURIComponent(
    "Klartext-Zugriff auf Class-3-Kosten anfordern",
  )
  const body = encodeURIComponent(
    `Hallo,\n\nich benötige Klartext-Zugriff auf Class-3-Kosten im Projekt ${projectId}.\n\nDanke!`,
  )
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      <span className="mr-1">*</span>
      Rate maskiert. Sichtbar mit „Kosten-Klartext“-Berechtigung.{" "}
      <a
        href={`mailto:?subject=${subject}&body=${body}`}
        className="text-primary underline-offset-2 hover:underline"
        data-testid="class-three-request-link"
      >
        Klartext anfordern →
      </a>
    </p>
  )
}
