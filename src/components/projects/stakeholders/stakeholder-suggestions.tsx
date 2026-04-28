"use client"

import { Plus, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { StakeholderSuggestion } from "@/types/stakeholder"

interface StakeholderSuggestionsProps {
  suggestions: StakeholderSuggestion[]
  loading: boolean
  hasDismissals: boolean
  onAdd: (s: StakeholderSuggestion) => void
  onDismiss: (s: StakeholderSuggestion) => void
  onClearDismissals: () => void
}

/**
 * Sidebar listing role suggestions derived from the project type catalog.
 * Each card has Add (creates a new stakeholder draft pre-filled with the
 * role) and Dismiss (hides the suggestion for this project).
 */
export function StakeholderSuggestions({
  suggestions,
  loading,
  hasDismissals,
  onAdd,
  onDismiss,
  onClearDismissals,
}: StakeholderSuggestionsProps) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Empfohlene Rollen</CardTitle>
        <CardDescription>
          Aus dem Projekttyp-Katalog. Schon eingetragene oder verworfene Rollen
          erscheinen nicht.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Lade Vorschläge …</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Keine offenen Vorschläge.
          </p>
        ) : (
          suggestions.map((s) => (
            <div
              key={s.role_key}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <span className="truncate text-sm">{s.label_de}</span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAdd(s)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDismiss(s)}
                  aria-label={`${s.label_de} verwerfen`}
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))
        )}

        {hasDismissals ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0"
            onClick={onClearDismissals}
          >
            <RotateCcw className="mr-1 h-3 w-3" aria-hidden />
            Verworfene Vorschläge zurückholen
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
