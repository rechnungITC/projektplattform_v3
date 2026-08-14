"use client"

import * as React from "react"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  buildSectionTree,
  flattenSectionTree,
  useConstructionSections,
  useProjectTrades,
} from "@/hooks/use-construction"

/** Sentinel for "no selection" — Radix Select cannot hold an empty string. */
export const NO_CONSTRUCTION_VALUE = "__none__"

interface Props {
  projectId: string
  tradeId: string | null | undefined
  sectionId?: string | null | undefined
  onTradeChange: (value: string | null) => void
  /** Omit to render only the trade picker (used by the risk form, AC-45.19). */
  onSectionChange?: (value: string | null) => void
  disabled?: boolean
}

/**
 * PROJ-45-α — the two construction axes as a reusable pair of pickers, so the
 * work-item dialog and the risk form cannot drift apart in wording or
 * behaviour.
 *
 * Both fields are OPTIONAL by design (lock L6): a construction project may
 * record work before its breakdown exists, and forcing a choice would push
 * people into inventing placeholder trades. The caller decides whether to
 * render this at all — it belongs in construction projects with the module on.
 */
export function ConstructionAxisFields({
  projectId,
  tradeId,
  sectionId,
  onTradeChange,
  onSectionChange,
  disabled = false,
}: Props) {
  const { trades, moduleInactive } = useProjectTrades(projectId)
  const { sections } = useConstructionSections(projectId)

  const sectionRows = React.useMemo(
    () => flattenSectionTree(buildSectionTree(sections)),
    [sections]
  )

  // Nothing to offer and nothing to explain: stay out of the dialog entirely
  // rather than showing two empty dropdowns.
  if (moduleInactive) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="construction-trade">Gewerk</Label>
        <Select
          value={tradeId ?? NO_CONSTRUCTION_VALUE}
          disabled={disabled || trades.length === 0}
          onValueChange={(value) =>
            onTradeChange(value === NO_CONSTRUCTION_VALUE ? null : value)
          }
        >
          <SelectTrigger id="construction-trade">
            <SelectValue
              placeholder={
                trades.length === 0 ? "Noch keine Gewerke im Projekt" : "Kein Gewerk"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CONSTRUCTION_VALUE}>— kein Gewerk —</SelectItem>
            {trades.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.trade?.label ?? "Unbekanntes Gewerk"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onSectionChange ? (
        <div className="space-y-2">
          <Label htmlFor="construction-section">Bauabschnitt</Label>
          <Select
            value={sectionId ?? NO_CONSTRUCTION_VALUE}
            disabled={disabled || sectionRows.length === 0}
            onValueChange={(value) =>
              onSectionChange(value === NO_CONSTRUCTION_VALUE ? null : value)
            }
          >
            <SelectTrigger id="construction-section">
              <SelectValue
                placeholder={
                  sectionRows.length === 0
                    ? "Noch keine Bauabschnitte"
                    : "Kein Bauabschnitt"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CONSTRUCTION_VALUE}>— kein Abschnitt —</SelectItem>
              {sectionRows.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {" ".repeat(node.depth * 3)}
                  {node.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}
