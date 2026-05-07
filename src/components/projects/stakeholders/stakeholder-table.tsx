"use client"

import { Building2, Circle, User2 } from "lucide-react"
import * as React from "react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  STAKEHOLDER_ATTITUDE_LABELS,
  STAKEHOLDER_KIND_LABELS,
  STAKEHOLDER_ORIGIN_LABELS,
  STAKEHOLDER_SCORE_LABELS,
  type Stakeholder,
  type StakeholderAttitude,
  type StakeholderScore,
} from "@/types/stakeholder"
import type { StakeholderType } from "@/types/stakeholder-type"

const SCORE_TONE: Record<StakeholderScore, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  critical: "bg-destructive/15 text-destructive",
}

// PROJ-33 — Haltungs-Icon-Farbcoding für die Liste.
const ATTITUDE_TONE: Record<StakeholderAttitude, string> = {
  supportive: "fill-success text-success",
  neutral: "fill-muted-foreground/40 text-muted-foreground/40",
  critical: "fill-warning text-warning",
  blocking: "fill-destructive text-destructive",
}

interface StakeholderTableProps {
  stakeholders: Stakeholder[]
  /** PROJ-33-β — Catalog für Type-Badge-Color-Lookup. Optional. */
  stakeholderTypes?: StakeholderType[]
  onRowClick: (s: Stakeholder) => void
}

export function StakeholderTable({
  stakeholders,
  stakeholderTypes = [],
  onRowClick,
}: StakeholderTableProps) {
  // PROJ-33-β — Lookup von type_key zu Catalog-Eintrag (für Color-Badge).
  const typeByKey = React.useMemo(() => {
    const m = new Map<string, StakeholderType>()
    for (const t of stakeholderTypes) m.set(t.key, t)
    return m
  }, [stakeholderTypes])
  if (stakeholders.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Noch keine Stakeholder. Wähle einen Vorschlag aus der Sidebar oder
        klicke auf „+ Stakeholder&ldquo;.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Name</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead className="hidden sm:table-cell">Org-Einheit</TableHead>
            <TableHead className="hidden md:table-cell">Herkunft</TableHead>
            <TableHead>Einfluss</TableHead>
            <TableHead>Impact</TableHead>
            <TableHead className="w-[60px] text-center">Haltung</TableHead>
            <TableHead className="w-[80px] text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stakeholders.map((s) => {
            const Icon = s.kind === "person" ? User2 : Building2
            return (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => onRowClick(s)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Icon
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="truncate">{s.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {STAKEHOLDER_KIND_LABELS[s.kind]} ·{" "}
                    {STAKEHOLDER_ORIGIN_LABELS[s.origin]}
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{s.role_key ?? "—"}</span>
                    {s.stakeholder_type_key &&
                      (() => {
                        const t = typeByKey.get(s.stakeholder_type_key)
                        if (!t) {
                          return (
                            <Badge variant="outline" className="text-xs">
                              {s.stakeholder_type_key}
                            </Badge>
                          )
                        }
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                                style={{
                                  backgroundColor: `${t.color}20`,
                                  borderColor: t.color,
                                  color: t.color,
                                }}
                              >
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: t.color }}
                                />
                                <span>{t.label_de}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t.is_active
                                ? `Stakeholder-Typ: ${t.label_de}`
                                : `Stakeholder-Typ (deaktiviert): ${t.label_de}`}
                            </TooltipContent>
                          </Tooltip>
                        )
                      })()}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {s.org_unit ?? "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline">
                    {STAKEHOLDER_ORIGIN_LABELS[s.origin]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs",
                      SCORE_TONE[s.influence]
                    )}
                  >
                    {STAKEHOLDER_SCORE_LABELS[s.influence]}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs",
                      SCORE_TONE[s.impact]
                    )}
                  >
                    {STAKEHOLDER_SCORE_LABELS[s.impact]}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {s.attitude ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Circle
                          className={cn("inline-block h-3 w-3", ATTITUDE_TONE[s.attitude])}
                          aria-label={STAKEHOLDER_ATTITUDE_LABELS[s.attitude]}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        Haltung: {STAKEHOLDER_ATTITUDE_LABELS[s.attitude]}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {s.is_active ? (
                    <Badge variant="secondary">Aktiv</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inaktiv
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
