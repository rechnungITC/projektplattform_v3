"use client"

/**
 * PROJ-65 ε.1 — AI-Proposal-Drawer placeholder.
 *
 * Full drawer ships in PROJ-65 ε.4. The placeholder shows the
 * recommendation title so users see immediate value when clicking
 * the AI badge instead of an opaque stub.
 */

import * as React from "react"
import { Sparkles } from "lucide-react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface AIProposalDrawerPlaceholderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendationTitle: string | null
  recommendationCount: number
}

export function AIProposalDrawerPlaceholder({
  open,
  onOpenChange,
  recommendationTitle,
  recommendationCount,
}: AIProposalDrawerPlaceholderProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" aria-hidden />
            KI-Vorschläge
          </SheetTitle>
          <SheetDescription>
            {recommendationCount === 1
              ? "1 KI-Vorschlag für diesen Knoten."
              : `${recommendationCount} KI-Vorschläge für diesen Knoten.`}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          {recommendationTitle && (
            <div className="rounded-md border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Vorschlag
              </p>
              <p className="mt-1 font-medium">{recommendationTitle}</p>
            </div>
          )}
          <p className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            Vollständige Bewertung, Annehmen/Ablehnen und Plan-Mutate
            erscheinen in einem Folge-Slice (ε.4 — AI). In ε.1 sind
            Vorschläge nur als Indikator sichtbar.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
