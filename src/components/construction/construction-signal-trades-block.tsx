"use client"

import { ArrowUpRight, HardHat } from "lucide-react"
import Link from "next/link"

import { ConstructionSignalExportButton } from "@/components/construction/construction-signal-export-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  CONSTRUCTION_BLOCKER_REASONS,
  CONSTRUCTION_BLOCKER_REASON_LABELS,
  CONSTRUCTION_MANUAL_STATUS_LABELS,
} from "@/lib/construction/signals"
import type { ConstructionRagStatus } from "@/types/construction"
import type { ConstructionTradeSignal } from "@/types/construction-signals"

const MANUAL_STATUS_STYLES: Record<ConstructionRagStatus, string> = {
  gruen: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  gelb: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  rot: "bg-red-500/15 text-red-700 dark:text-red-300",
}

/**
 * PROJ-45-δ, Block 1 — die Gewerke des Projekts als Signal-Liste.
 *
 * DREI ZUSAGEN, die das Aussehen dieser Zeilen bestimmen:
 *
 *  1. **Alle Gewerke, auch die ohne Befund** (AC-45δ.1). Ein Gewerk ohne
 *     Blocker wird AUSDRÜCKLICH als „ohne Befund" gekennzeichnet und nicht
 *     durch Abwesenheit — die Auswertung liefert dafür bereits alle Zeilen
 *     (sie baut die Liste aus `project_construction_trades`, nicht aus der
 *     Mängel-Gruppierung).
 *  2. **Zwei Angaben nebeneinander, beide beschriftet** (L26/AC-45δ.2). Links
 *     „Bewertung Bauleitung" (die manuelle α-Ampel), rechts „Aus den Daten"
 *     (das gerechnete Signal). Weichen sie ab, ist genau das die interessante
 *     Information — deshalb wird auch nicht die eine durch die andere ersetzt
 *     und keine von beiden hervorgehoben.
 *  3. **Drei getrennte Zahlen, nicht addiert** (AC-45δ.5). „Überfällig",
 *     „ohne Frist" und „wartet auf Prüfung" sind drei verschiedene Aussagen:
 *     β zählt `erledigt` bei „überfällig" bewusst NICHT mit (dort wartet die
 *     Prüfung, die Verspätung läge bei der Bauleitung). Eine Summe würde
 *     denselben Mangel doppelt zählen und die Bedeutung verwischen.
 *
 * Die Zeile mutiert nichts (AC-45δ.22): die Aktionen sind Sprünge auf die
 * Mängel- bzw. Abnahme-Fläche, gefiltert wird dort.
 */
export function ConstructionSignalTradesBlock({
  projectId,
  trades,
}: {
  projectId: string
  trades: ConstructionTradeSignal[]
}) {
  const blocked = trades.filter((t) => t.is_blocked).length

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardHat className="h-4 w-4 text-muted-foreground" aria-hidden />
              Gewerke
            </CardTitle>
            <CardDescription>
              {trades.length === 0
                ? "Noch kein Gewerk zugeordnet."
                : `${trades.length} Gewerk${trades.length === 1 ? "" : "e"}, davon ${blocked} mit Blocker.`}
            </CardDescription>
          </div>
          <ConstructionSignalExportButton
            projectId={projectId}
            section="trades"
            label="Gewerke"
            disabled={trades.length === 0}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {trades.length === 0 ? (
          <div className="space-y-2 px-6 pb-6">
            {/* Kein „alles in Ordnung": es ist nichts zugeordnet, also ist
                nichts geprüft (PROJ-64 AC-9). */}
            <p className="text-sm text-muted-foreground">
              Diesem Projekt ist noch kein Gewerk zugeordnet — es gibt daher
              nichts zu bewerten, nicht „keine Blocker“.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${projectId}/gewerke`}>
                Gewerke zuordnen
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {trades.map((t) => {
              const reasons = CONSTRUCTION_BLOCKER_REASONS.filter((r) =>
                t.blocker_reasons.includes(r)
              )
              return (
                <li key={t.project_trade_id} className="space-y-2.5 px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-sm font-medium">{t.trade_label}</p>

                    {/* L26 — zwei Angaben, zwei Herkünfte, beide benannt. */}
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          Bewertung Bauleitung:
                        </span>
                        <Badge className={MANUAL_STATUS_STYLES[t.manual_status]}>
                          {CONSTRUCTION_MANUAL_STATUS_LABELS[t.manual_status]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          Aus den Daten:
                        </span>
                        {t.is_blocked ? (
                          <Badge variant="destructive">Blockiert</Badge>
                        ) : (
                          <Badge variant="outline">Ohne Befund</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AC-45δ.3 — der Grund wird benannt, nicht nur die Farbe. */}
                  {reasons.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {reasons.map((r) => (
                        <Badge
                          key={r}
                          variant="outline"
                          className="border-destructive/40 text-destructive"
                        >
                          {CONSTRUCTION_BLOCKER_REASON_LABELS[r]}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  {/* AC-45δ.5 — drei Zahlen, getrennt. */}
                  <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                    <div className="flex items-center gap-1.5">
                      <dt className="text-muted-foreground">Überfällig</dt>
                      <dd
                        className={
                          t.overdue_defects > 0
                            ? "font-semibold text-destructive"
                            : "font-medium"
                        }
                      >
                        {t.overdue_defects}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt className="text-muted-foreground">Ohne Frist</dt>
                      <dd className="font-medium">
                        {t.defects_without_due_date}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt className="text-muted-foreground">
                        Wartet auf Prüfung
                      </dt>
                      <dd className="font-medium">
                        {t.defects_awaiting_review}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/projects/${projectId}/maengel`}>
                        Mängel ansehen
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/projects/${projectId}/abnahmen`}>
                        Abnahmen ansehen
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
