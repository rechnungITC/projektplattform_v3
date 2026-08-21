"use client"

import { ArrowUpRight, ChevronRight, FolderTree } from "lucide-react"
import Link from "next/link"

import { ConstructionSignalExportButton } from "@/components/construction/construction-signal-export-button"
import { buildSignalSectionRows } from "@/components/construction/construction-signal-tree"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  describeProgressSource,
  hasCancelledOnlyLinks,
  hasComparableProgress,
} from "@/lib/construction/signals"
import type { ConstructionSectionSignal } from "@/types/construction-signals"

/**
 * PROJ-45-δ, Block 2 — die Bauabschnitte als eingerückter Baum.
 *
 * DER KERN DIESES BLOCKS IST, WAS NICHT GEZEICHNET WIRD. Ist nichts verknüpft,
 * erscheint **kein** Fortschrittsbalken und **kein** „0 %", sondern der Grund
 * mit einer Handlungsaufforderung (AC-45δ.10, ST-δ6). Das ist keine
 * Randbedingung, sondern der Normalfall: in Prod sind alle drei additiven
 * α-Verweise bei null Zeilen. Ein Balken auf 0 % würde „nichts fertig"
 * behaupten, wo „nichts messbar" gilt — die Verwechslung, gegen die L28
 * geschrieben ist.
 *
 * Denselben Ausgang nimmt „verknüpft, aber nichts zählbar"
 * ({@link hasCancelledOnlyLinks}): alle verknüpften Vorgänge sind verworfen und
 * fallen aus dem Nenner (D-δ5), ein Fortschritt ist dort gar nicht definiert.
 * Beide Fälle bekommen ihre Formulierung aus {@link describeProgressSource} —
 * die Texte werden hier NICHT neu formuliert, damit Ansicht, CSV-Ausgabe und
 * Bericht dasselbe sagen.
 *
 * Die Einrückung kommt aus {@link buildSignalSectionRows}: `subtree_depth` in
 * der Nutzlast ist die HÖHE des Teilbaums, nicht die Einrücktiefe, und die
 * Liste ist nur flach sortiert. Beides ist dort ausgeführt und eingefroren.
 */
export function ConstructionSignalSectionsBlock({
  projectId,
  sections,
}: {
  projectId: string
  sections: ConstructionSectionSignal[]
}) {
  const rows = buildSignalSectionRows(sections)
  const unmeasurable = rows.filter((r) => !hasComparableProgress(r.section)).length

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderTree className="h-4 w-4 text-muted-foreground" aria-hidden />
              Bauabschnitte
            </CardTitle>
            <CardDescription>
              {rows.length === 0
                ? "Noch kein Bauabschnitt angelegt."
                : `${rows.length} Abschnitt${rows.length === 1 ? "" : "e"}, davon ${unmeasurable} ohne berechenbaren Fortschritt.`}
            </CardDescription>
          </div>
          <ConstructionSignalExportButton
            projectId={projectId}
            section="sections"
            label="Abschnitte"
            disabled={rows.length === 0}
          />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="space-y-2 px-6 pb-6">
            <p className="text-sm text-muted-foreground">
              Für dieses Projekt ist keine Gliederung angelegt — es gibt daher
              keinen Ortsfortschritt zu messen, nicht „keinen Verzug“.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${projectId}/bauabschnitte`}>
                Bauabschnitte anlegen
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map(({ section, depth }) => {
              const measurable = hasComparableProgress(section)
              const cancelledOnly = hasCancelledOnlyLinks(section)
              const description = describeProgressSource(section)
              return (
                <li
                  key={section.section_id}
                  className="py-3 pr-6"
                  style={{ paddingLeft: `${depth * 20 + 24}px` }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {depth > 0 ? (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : null}
                      <p className="truncate text-sm font-medium">
                        {section.label}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* PROJ-Y-45l — die Kappung wird BENANNT. Vorher zählte
                          die Auswertung in diesem Fall still zu niedrig; ein
                          Fortschritt, dem Vorgänge fehlen, darf nicht wie eine
                          vollständige Zahl aussehen. */}
                      {section.subtree_truncated ? (
                        <Badge variant="outline">
                          Teilbaum gekappt ab Ebene {section.subtree_depth}
                        </Badge>
                      ) : null}
                      {section.overdue_items > 0 ? (
                        <Badge variant="destructive">
                          {section.overdue_items} überfällig
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  {measurable ? (
                    <div className="mt-2 max-w-md space-y-1">
                      <div className="flex items-center gap-3">
                        <Progress
                          className="h-2"
                          value={section.progress_percent ?? 0}
                          aria-label={`Fortschritt ${section.label}`}
                        />
                        <span className="shrink-0 text-xs font-medium tabular-nums">
                          {section.progress_percent}&nbsp;%
                        </span>
                      </div>
                      {/* AC-45δ.9 — die Quelle steht dabei, immer. */}
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {/* AC-45δ.10 — kein Balken, kein „0 %", sondern der Grund. */}
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                      <Button asChild size="sm" variant="ghost">
                        {/* Bewusst dieselbe Fläche für beide Fälle: dort hängt
                            die Verknüpfung. Ein Sprung in den Backlog wäre der
                            fünfte Zielpfad und methodenabhängig (PROJ-28
                            leitet `/backlog` je Methode um) — das ist eine
                            eigene Entscheidung, nicht eine Randnotiz. */}
                        <Link href={`/projects/${projectId}/bauabschnitte`}>
                          {cancelledOnly
                            ? "Verknüpfung im Abschnitt prüfen"
                            : "Arbeitspakete oder Phasen verknüpfen"}
                          <ArrowUpRight
                            className="ml-1 h-3.5 w-3.5"
                            aria-hidden
                          />
                        </Link>
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
