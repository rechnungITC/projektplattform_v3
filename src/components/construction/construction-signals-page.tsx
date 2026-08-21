"use client"

import { RotateCcw } from "lucide-react"
import * as React from "react"

import { ModuleUnavailableNotice } from "@/components/app/module-unavailable-notice"
import { ConstructionSignalDeadlinesBlock } from "@/components/construction/construction-signal-deadlines-block"
import { ConstructionSignalDefectsBlock } from "@/components/construction/construction-signal-defects-block"
import { ConstructionSignalSectionsBlock } from "@/components/construction/construction-signal-sections-block"
import { ConstructionSignalTradesBlock } from "@/components/construction/construction-signal-trades-block"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/use-auth"
import { useConstructionScheduleSignals } from "@/hooks/use-construction-signals"
import { useTenantMembers } from "@/hooks/use-tenant-members"
import type { ConstructionSignalSummary } from "@/types/construction-signals"

/** `YYYY-MM-DD…`-Zeitstempel als Datum, ohne Zeitzonen-Umweg. */
function formatAsOf(asOf: string): string {
  const day = asOf.slice(0, 10)
  const [y, m, d] = day.split("-")
  return y && m && d ? `${d}.${m}.${y}` : asOf
}

/**
 * Die Kopfzeile: vier getrennte Zahlen (AC-45δ.15).
 *
 * Sie kommen als Ganzes aus `summary` und werden AUSDRÜCKLICH NICHT aus den
 * Listen abgeleitet. Die Auswertung rechnet sie über die ungefilterte Grundmenge
 * (Muster PROJ-103); die Listen darunter sind gedeckelt bzw. auf ein Zeitfenster
 * begrenzt. Aus ihnen zu summieren würde je nach Block zu kleine Zahlen ergeben
 * — und zwar unauffällig.
 *
 * Die vier Zahlen werden auch nicht addiert: „überfällig", „ohne Frist" und
 * „wartet auf Prüfung" sind drei verschiedene Aussagen über teils dieselben
 * Mängel (AC-45δ.5/.6).
 */
function SignalSummaryRow({ summary }: { summary: ConstructionSignalSummary }) {
  const cells: Array<{ label: string; value: number; alarm: boolean }> = [
    { label: "Überfällig", value: summary.overdue_defects, alarm: summary.overdue_defects > 0 },
    { label: "Ohne Frist", value: summary.defects_without_due_date, alarm: false },
    { label: "Wartet auf Prüfung", value: summary.defects_awaiting_review, alarm: false },
    { label: "Offene Blocker", value: summary.blocked_trades, alarm: summary.blocked_trades > 0 },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((c) => (
        <Card key={c.label}>
          <CardHeader className="pb-3">
            <CardDescription>{c.label}</CardDescription>
            <CardTitle
              className={
                c.alarm ? "text-2xl text-destructive" : "text-2xl"
              }
            >
              {c.value}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

/**
 * PROJ-45-δ — der Projektraum-Reiter „Terminsignale".
 *
 * Bis γ war die Bau-Erweiterung eine Erfassungsfläche: Gewerke, Abschnitte,
 * Mängel und Abnahmen ließen sich anlegen und einzeln durchsehen. Diese Fläche
 * ist der zusammenfassende Blick, mit dem eine Bauleitung morgens auf die
 * Baustelle schaut — welches Gewerk hängt, welcher Abschnitt kommt nicht voran,
 * was ist diese Woche fällig, wo brennt es am längsten.
 *
 * DREI EIGENSCHAFTEN UNTERSCHEIDEN SIE VON α/β/γ:
 *
 *  1. **Rein lesend** (AC-45δ.22). Es gibt keinen Schreibpfad; jede Aktion ist
 *     ein Sprung auf die zuständige Fläche. Deshalb — und das ist bewusst
 *     ANDERS als bei β/γ — wird `manage_members` hier NICHT abgefragt: das ist
 *     γs Schreib-Gate und wäre hier eine erfundene Hürde. Jedes Projektmitglied
 *     mit Leserecht sieht die Fläche (AC-45δ.23, D-δ10); die Route gatet `view`,
 *     und weil die Auswertung `SECURITY INVOKER` ist, rechnet sie unter der RLS
 *     des Aufrufers — wer eine Zeile nicht sehen darf, kann sie auch aus den
 *     Kopfzahlen nicht erschliessen.
 *  2. **Ein Abruf, ein Zeitbezug.** Alle vier Blöcke rechnen gegen dasselbe
 *     `as_of` (D-δ1). Vier getrennte Abrufe könnten über Mitternacht
 *     auseinanderfallen; die Fläche zeigt darum auch den Stand ausdrücklich an.
 *  3. **Der Gantt bleibt unberührt** (L24/AC-45δ.24). Diese Fläche steht an
 *     seiner Stelle: Bauabschnitte tragen keine Termine, eine vierte
 *     Gantt-Zeilenart wäre teuer und liefe für jedes heutige Projekt leer.
 *
 * Kein Leerzustand dieser Fläche behauptet „alles in Ordnung" (PROJ-64 AC-9).
 * „Kein Gewerk zugeordnet" heisst nicht „keine Blocker", und „nichts verknüpft"
 * heisst nicht „0 % Fortschritt" — in Prod ist genau das der Normalfall, weil
 * alle drei additiven α-Verweise heute bei null Zeilen stehen.
 */
export function ConstructionSignalsPage({ projectId }: { projectId: string }) {
  const { currentTenant } = useAuth()
  const { signals, loading, moduleInactive, error, refresh } =
    useConstructionScheduleSignals(projectId)
  const { members } = useTenantMembers(currentTenant?.id)

  const userName = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const member of members) {
      m.set(
        member.user_id,
        member.display_name ?? member.email.split("@")[0] ?? "—"
      )
    }
    return m
  }, [members])

  if (moduleInactive) {
    return (
      <ModuleUnavailableNotice
        title="Bauprojekte sind für diesen Arbeitsbereich nicht aktiv"
        description="Terminsignale gehören zum Modul „Bauprojekte“. Eine Administratorin kann es in den Arbeitsbereich-Einstellungen aktivieren."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Terminsignale
          </h1>
          <p className="text-sm text-muted-foreground">
            Blockierte Gewerke, Fortschritt je Bauabschnitt, anstehende Fristen
            und die am längsten überfälligen Mängel — zusammengefasst und
            ausschliesslich lesend.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
          Aktualisieren
        </Button>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : signals === null ? (
        // Die Route antwortet `{ signals: null }`, wenn es für dieses Projekt
        // keine Auswertung gibt. Bewusst KEIN Ersatzobjekt aus Nullen: das wäre
        // „alles bei 0" und damit eine Entwarnung, die niemand geprüft hat.
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Für dieses Projekt liegt keine Auswertung vor
            </CardTitle>
            <CardDescription>
              Terminsignale werden nur für Bauprojekte gerechnet. Das ist keine
              Aussage über Fristen oder Blocker — es wurde nichts ausgewertet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-6">
          <SignalSummaryRow summary={signals.summary} />

          <p className="text-xs text-muted-foreground">
            Stand {formatAsOf(signals.as_of)} · alle vier Blöcke gegen denselben
            Zeitpunkt gerechnet
          </p>

          <ConstructionSignalTradesBlock
            projectId={projectId}
            trades={signals.trades}
          />
          <ConstructionSignalSectionsBlock
            projectId={projectId}
            sections={signals.sections}
          />
          <ConstructionSignalDeadlinesBlock
            projectId={projectId}
            deadlines={signals.deadlines}
            windowDays={signals.window_days}
          />
          <ConstructionSignalDefectsBlock
            projectId={projectId}
            defects={signals.overdue_defects}
            userName={userName}
          />
        </div>
      )}
    </div>
  )
}
