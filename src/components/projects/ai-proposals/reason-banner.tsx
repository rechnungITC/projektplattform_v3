"use client"

/**
 * PROJ-137 AC-4 — single rendering path for the actionable "why did the
 * KI run produce nothing?" banner across the three AIProposalDrawer tabs
 * (Backlog / Stakeholder / Risiken).
 *
 * Driven by {@link reasonCodeToBanner} (Decision D — one mapping source).
 * Mirrors the pre-existing amber `ServerOff` banner markup that the risk
 * + stakeholder tabs already used, so the visual language is consistent.
 *
 * `errorMessage` (the router's human-readable detail string) is shown as
 * a small muted supplementary line — kept so PROJ-88/89 support detail
 * doesn't regress.
 */

import Link from "next/link"
import { ServerOff } from "lucide-react"

import type { ReasonCodeBanner } from "@/lib/ai-proposals/reason-code-banner"

interface ReasonBannerProps {
  banner: ReasonCodeBanner
  errorMessage?: string | null
  testId: string
}

export function ReasonBanner({
  banner,
  errorMessage,
  testId,
}: ReasonBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200"
      data-testid={testId}
    >
      <ServerOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <strong>{banner.title}.</strong> {banner.body}
        {banner.action && (
          <>
            {" "}
            <Link
              href={banner.action.href}
              className="underline underline-offset-2"
            >
              {banner.action.label}
            </Link>
          </>
        )}
        {errorMessage && (
          <span className="mt-1 block text-[11px] text-amber-700/80 dark:text-amber-300/80">
            {errorMessage}
          </span>
        )}
      </span>
    </div>
  )
}