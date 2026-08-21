/**
 * PROJ-45-δ (AC-45δ.17) — Anzeige des eingefrorenen Bau-Blocks im
 * Status-Report. Rein darstellend: kein Laden, kein Rechnen, keine
 * Zustandshaltung. `construction` ist der zum Erzeugungszeitpunkt
 * eingefrorene JSONB-Ausschnitt und wird hier NUR gelesen.
 *
 * DREI DINGE, DIE HIER BEWUSST *NICHT* PASSIEREN:
 *
 * 1. Die Blockade-Gründe werden nicht neu formuliert. Sie kommen aus
 *    {@link CONSTRUCTION_BLOCKER_REASON_LABELS} — der Bericht ist die
 *    dritte Fläche nach Oberfläche und CSV-Ausgabe, und drei Formulierungen
 *    für denselben Grund würden auseinanderlaufen.
 * 2. Es wird nichts nachgerechnet. `blocked_trades_total`,
 *    `overdue_defects_total` und der Abschnittsfortschritt stammen aus der
 *    Auswertung `construction_schedule_signals` (ein Zeitbezug, D-δ1) und
 *    sind eingefroren. Eine zweite Zählung über `blocked_trades.length`
 *    wäre eine zweite Wahrheit.
 * 3. `progress_percent === null` wird NIEMALS als „0 %" gezeigt (AC-45δ.10).
 *    Der eingefrorene Block behält `progress_source`, deshalb sind die zwei
 *    Ursachen unterscheidbar: „nichts verknüpft" und „verknüpft, aber nichts
 *    zählbar". Ohne diese Unterscheidung wäre ein leerer Abschnitt nicht von
 *    einem Abschnitt mit ausschliesslich abgebrochenen Vorgängen zu trennen.
 *
 * WARUM NICHT `describeProgressSource` AUS `lib/construction/signals`:
 * dessen Eingabe (`ProgressSourceInput`) verlangt `source_count`,
 * `linked_count` und `phase_linked_count`. Genau diese drei Zahlen lässt der
 * Bau-Block bewusst weg — Einzelzahlen gehören auf die Bau-Fläche, nicht in
 * den eingefrorenen Bericht (AC-45δ.17). Die Funktion mit Platzhalter-Nullen
 * zu rufen hiesse, Zahlen zu erfinden, die im Schnappschuss nie standen;
 * die Formulierung hier nennt deshalb die Quelle ohne Mengenangabe.
 */
import { CONSTRUCTION_BLOCKER_REASON_LABELS } from "@/lib/construction/signals"
import type {
  SnapshotConstructionBlock,
  SnapshotConstructionBlockedTrade,
  SnapshotConstructionSection,
} from "@/lib/reports/types"
import type { ConstructionProgressSource } from "@/types/construction-signals"

/**
 * Die Quelle des Abschnittsfortschritts als Nominativ-Plural — bewusst ohne
 * Deklinationstabelle, damit der Satzbau ohne Dativform auskommt. Totaler
 * `Record`: eine künftige dritte Quelle bricht hier, statt unbeschriftet in
 * den Bericht zu rutschen.
 */
const PROGRESS_SOURCE_LABELS: Record<ConstructionProgressSource, string> = {
  work_items: "Arbeitspakete",
  phases: "Phasen",
}

function sourceLabel(source: string): string {
  // `?? source` statt Leerstring: ein Wert, den dieser Build nicht kennt
  // (alter oder neuerer Schnappschuss), wird ROH gezeigt statt verschwiegen.
  return (
    PROGRESS_SOURCE_LABELS[source as ConstructionProgressSource] ?? source
  )
}

/**
 * Die Grundlage des Abschnittsfortschritts — vier Fälle, jeder mit eigener
 * Aussage. Keine Rückgabe darf als Entwarnung lesbar sein: „nichts verknüpft"
 * heisst nicht „nichts offen", sondern „hier ist nichts messbar"
 * (AC-45δ.9 / AC-45δ.10).
 *
 * Exportiert, damit der Test genau diese Unterscheidung pinnen kann.
 */
export function describeSnapshotProgressBasis(
  section: Pick<SnapshotConstructionSection, "progress_percent" | "progress_source">,
): string {
  const source = section.progress_source

  if (section.progress_percent === null) {
    if (source === null) {
      return "Nichts verknüpft — kein Fortschritt berechenbar"
    }
    return `${sourceLabel(source)} verknüpft, nichts zählbar — kein Fortschritt berechenbar`
  }

  // Prozentwert ohne Quelle: kommt aus der Auswertung nicht vor, wird aber
  // benannt statt stillschweigend als vollwertige Angabe gezeigt.
  if (source === null) return "Quelle nicht angegeben"

  return `Quelle: ${sourceLabel(source)}`
}

/** Die benannten Gründe einer Blockade, in der Reihenfolge der Auswertung. */
export function describeBlockerReasons(
  reasons: SnapshotConstructionBlockedTrade["blocker_reasons"],
): string {
  if (reasons.length === 0) return "Grund nicht benannt"
  return reasons
    .map((r) => CONSTRUCTION_BLOCKER_REASON_LABELS[r] ?? r)
    .join(" · ")
}

function formatAsOf(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  // Tagesgenau: die zugrunde liegenden Fristen sind Datumswerte, eine
  // Uhrzeit würde eine Genauigkeit behaupten, die die Daten nicht haben.
  return d.toLocaleDateString("de-DE", { dateStyle: "medium" })
}

interface ConstructionSignalReportBlockProps {
  construction: SnapshotConstructionBlock
}

export function ConstructionSignalReportBlock({
  construction,
}: ConstructionSignalReportBlockProps) {
  const { blocked_trades: blockedTrades, sections } = construction

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <strong className="tabular-nums text-foreground">
            {construction.trades_total}
          </strong>{" "}
          Gewerke ·{" "}
          <strong className="tabular-nums text-foreground">
            {construction.blocked_trades_total}
          </strong>{" "}
          blockiert ·{" "}
          <strong className="tabular-nums text-foreground">
            {construction.overdue_defects_total}
          </strong>{" "}
          überfällige Mängel
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Stand der Auswertung: {formatAsOf(construction.as_of)}
        </p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Blockierte Gewerke</h3>
        {blockedTrades.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Kein Gewerk blockiert.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {blockedTrades.map((trade, index) => (
              // Der Block ist eingefroren, die Reihenfolge also stabil; der
              // Schnappschuss trägt bewusst keine Kennungen, nur Bezeichnungen
              // (die sich wiederholen können) — daher Index im Schlüssel.
              <li
                key={`${trade.trade_label}#${index}`}
                className="flex flex-wrap items-baseline gap-x-2 text-sm"
              >
                <span className="font-medium">{trade.trade_label}</span>
                <span className="text-muted-foreground">
                  {describeBlockerReasons(trade.blocker_reasons)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Abschnittsfortschritt</h3>
        {sections.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Keine Bauabschnitte angelegt.
          </p>
        ) : (
          <table className="mt-1 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Bauabschnitt</th>
                <th className="py-2 pr-4 font-medium">Fortschritt</th>
                <th className="py-2 pr-4 font-medium">Grundlage</th>
                <th className="py-2 font-medium">Überfällige Vorgänge</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section, index) => (
                <tr
                  key={`${section.label}#${index}`}
                  className="border-b last:border-b-0"
                >
                  <td className="py-2 pr-4">{section.label}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {section.progress_percent === null
                      ? "—"
                      : `${section.progress_percent} %`}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {describeSnapshotProgressBasis(section)}
                  </td>
                  <td className="py-2 tabular-nums">{section.overdue_items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
