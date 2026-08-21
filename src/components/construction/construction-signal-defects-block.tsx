"use client"

import { AlertTriangle, ArrowUpRight } from "lucide-react"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ConstructionOverdueDefectRow } from "@/types/construction-signals"

/**
 * PROJ-45-δ, Block 4 — die überfälligen Mängel als Engpass-Übersicht.
 *
 * Dies ist der Ort, an dem **AC-45β.18** erfüllt wird (AC-45δ.16): die aus β
 * zurückgestellte Anforderung „überfällige Mängel in der Engpass-Sicht". Der
 * ORT weicht vom Wortlaut ab — dort steht die PROJ-103-Fläche, die ein
 * Bauprojekt nicht erreicht (`requiresProjectType: "ma"`, einwertiges Gate).
 * L25 hat das entschieden; die Abweichung ist benannt, nicht umgeschrieben.
 *
 * Die Reihenfolge (am längsten überfällig zuerst) kommt aus der Auswertung und
 * wird hier NICHT nachsortiert — `days_overdue` und die Ordnung entstehen gegen
 * denselben Zeitbezug wie die Kopfzahlen (D-δ1).
 *
 * „Überfällig" ist β's Begriff, wörtlich: gesetzte Frist verstrichen, Status
 * `offen` oder `in_bearbeitung`. Ein fertiggemeldeter Mangel steht hier
 * ABSICHTLICH nicht — dort wartet die Prüfung, und die Verspätung läge bei der
 * Bauleitung. Er wird in der Kopfzeile als „wartet auf Prüfung" gezählt
 * (AC-45δ.6), und derselbe Mangel kann gleichzeitig ein offener Vorbehalt einer
 * Abnahme sein: zwei Zahlen, zwei Bedeutungen, bewusst getrennt geführt.
 */
export function ConstructionSignalDefectsBlock({
  projectId,
  defects,
  userName,
}: {
  projectId: string
  defects: ConstructionOverdueDefectRow[]
  /** `user_id` → Anzeigename. Fehlt ein Eintrag, wird die Kennung nicht gezeigt. */
  userName: Map<string, string>
}) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              Engpässe: überfällige Mängel
            </CardTitle>
            <CardDescription>
              Am längsten überfällige zuerst. Nur Mängel, die Sie sehen dürfen.
            </CardDescription>
          </div>
          <ConstructionSignalExportButton
            projectId={projectId}
            section="overdue_defects"
            label="Engpässe"
            disabled={defects.length === 0}
          />
        </div>
      </CardHeader>

      <CardContent>
        {defects.length === 0 ? (
          <div className="space-y-2">
            {/* Hier IST „kein überfälliger Mangel" die wahre Aussage — die
                Auswertung hat nachgesehen. Was sie nicht sagt: dass es keine
                Mängel gibt. Fristlose und fertiggemeldete stehen in der
                Kopfzeile. */}
            <p className="text-sm text-muted-foreground">
              Kein Mangel hat seine Frist überschritten. Mängel ohne Frist und
              solche, die auf Prüfung warten, sind davon nicht erfasst — sie
              stehen in der Kopfzeile.
            </p>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/projects/${projectId}/maengel`}>
                Alle Mängel ansehen
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Über Frist</TableHead>
                <TableHead>Mangel</TableHead>
                <TableHead>Gewerk</TableHead>
                <TableHead>Ort</TableHead>
                <TableHead>Verantwortlich</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defects.map((d) => (
                <TableRow key={d.defect_id}>
                  <TableCell className="align-top">
                    <Badge variant="destructive" className="tabular-nums">
                      {d.days_overdue} Tag{d.days_overdue === 1 ? "" : "e"}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    <span className="text-muted-foreground">
                      #{d.ref_number}
                    </span>{" "}
                    {d.title}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {d.trade_label ?? "—"}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {d.section_label ?? "—"}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {d.responsible_user_id
                      ? (userName.get(d.responsible_user_id) ??
                        "nicht im Arbeitsbereich")
                      : "nicht zugewiesen"}
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
