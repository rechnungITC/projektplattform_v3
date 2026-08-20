"use client"

import { CalendarClock } from "lucide-react"

import { ConstructionSignalExportButton } from "@/components/construction/construction-signal-export-button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { splitDeadlines } from "@/lib/construction/signals"
import type {
  ConstructionDeadlineEntry,
  ConstructionDeadlineKind,
} from "@/types/construction-signals"

const KIND_LABELS: Record<ConstructionDeadlineKind, string> = {
  mangel: "Mangel",
  abnahme: "Abnahme",
}

/** `YYYY-MM-DD` ohne Zeitzonen-Umweg: `new Date("2026-08-20")` liest UTC und
 *  kippt in westlichen Zonen auf den Vortag. Die Auswertung liefert ein reines
 *  Datum, also wird es auch als reines Datum formatiert. */
function formatDay(due: string): string {
  const [y, m, d] = due.split("-")
  return y && m && d ? `${d}.${m}.${y}` : due
}

/**
 * PROJ-45-δ, Block 3 — „Nächste Fristen" im 14-Tage-Fenster.
 *
 * Die Ordnung kommt aus {@link splitDeadlines}: verstrichene ZUERST und
 * gekennzeichnet, danach die künftigen aufsteigend (AC-45δ.12). Sie wird hier
 * nicht nachgerechnet — `is_elapsed` entscheidet die Auswertung gegen ihren
 * einen Zeitbezug (`as_of`, D-δ1). Eine Vergleichsrechnung im Browser wäre eine
 * zweite Wahrheit und könnte, an einem anderen Tag als der Server, eine Frist
 * anders einordnen als die Kopfzahlen.
 *
 * Eine KÜNFTIGE angesetzte Abnahme steht hier — und ausdrücklich NICHT als
 * Blocker in Block 1 (L27/AC-45δ.13). Blockierend wird sie erst, wenn ihr
 * Termin verstrichen ist; dann erscheint sie hier oben UND dort als Grund.
 */
export function ConstructionSignalDeadlinesBlock({
  projectId,
  deadlines,
  windowDays,
}: {
  projectId: string
  deadlines: ConstructionDeadlineEntry[]
  windowDays: number
}) {
  const { elapsed, upcoming } = splitDeadlines(deadlines)
  const ordered = [...elapsed, ...upcoming]

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              Nächste Fristen
            </CardTitle>
            <CardDescription>
              Mängel-Fristen und Abnahmetermine der nächsten {windowDays} Tage
              {elapsed.length > 0
                ? ` · ${elapsed.length} bereits verstrichen`
                : ""}
              .
            </CardDescription>
          </div>
          <ConstructionSignalExportButton
            projectId={projectId}
            section="deadlines"
            label="Fristen"
            disabled={ordered.length === 0}
          />
        </div>
      </CardHeader>

      <CardContent>
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            In den nächsten {windowDays} Tagen steht kein Termin an, und es ist
            keiner verstrichen. Fristen ohne Datum erscheinen hier nicht — sie
            werden in der Kopfzeile als „ohne Frist“ gezählt.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Termin</TableHead>
                <TableHead className="w-24">Art</TableHead>
                <TableHead>Bezug</TableHead>
                <TableHead>Gewerk</TableHead>
                <TableHead>Bauabschnitt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((entry) => (
                <TableRow
                  key={`${entry.kind}-${entry.ref_id}`}
                  className={entry.is_elapsed ? "bg-destructive/5" : undefined}
                >
                  <TableCell className="whitespace-nowrap align-top">
                    <span
                      className={
                        entry.is_elapsed
                          ? "font-medium text-destructive"
                          : "font-medium"
                      }
                    >
                      {formatDay(entry.due_on)}
                    </span>
                    {entry.is_elapsed ? (
                      <Badge variant="destructive" className="ml-2">
                        verstrichen
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline">{KIND_LABELS[entry.kind]}</Badge>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    <span className="text-muted-foreground">
                      #{entry.ref_number}
                    </span>{" "}
                    {entry.label}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {entry.trade_label ?? "—"}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {entry.section_label ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
