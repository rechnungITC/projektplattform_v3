/**
 * PROJ-Y-151d — die Kostenzeile einer Unterhaltung als Text (AC-151.22).
 *
 * Der Kern des Kriteriums ist nicht die Zahl, sondern ihr Fehlen: „ohne Preis
 * wird das **gesagt** statt 0 € zu behaupten". Eine Null wäre von „kostet
 * nichts" nicht zu unterscheiden — deshalb gibt es für jeden Nicht-Fall einen
 * eigenen Satz und nirgends einen stillen Rückfall auf 0.
 *
 * Reine Funktion, damit die Formulierungen ohne Datenbank prüfbar sind.
 */

export type ChatCostSummary =
  | { known: true; amount: number; currency: string; unpriced: number }
  | { known: false; reason: "no_tokens" | "no_price" | "unavailable" }

export function costNotice(cost: ChatCostSummary | null): string | null {
  // Noch nichts geladen — schweigen ist richtig, eine Aussage wäre erfunden.
  if (cost === null) return null

  if (!cost.known) {
    switch (cost.reason) {
      case "no_tokens":
        // Vor der ersten Antwort gibt es nichts zu beziffern. Das ist kein
        // Mangel und wird deshalb auch nicht als einer formuliert.
        return null
      case "no_price":
        return "Kosten nicht bezifferbar — für das verwendete Modell ist kein Preis hinterlegt."
      case "unavailable":
        return "Kosten gerade nicht abrufbar."
    }
  }

  const betrag = formatAmount(cost.amount, cost.currency)
  if (cost.unpriced > 0) {
    // Teilsumme ausdrücklich als Teilsumme benennen: eine Zahl, die weniger
    // umfasst als sie zu umfassen scheint, ist schlimmer als keine.
    return (
      `Kosten dieser Unterhaltung: ${betrag} — ohne ` +
      `${cost.unpriced} ${cost.unpriced === 1 ? "Antwort" : "Antworten"} ohne hinterlegten Preis.`
    )
  }
  return `Kosten dieser Unterhaltung: ${betrag}.`
}

function formatAmount(amount: number, currency: string): string {
  // Zwei Nachkommastellen: die Rechnung rundet auf Cent, mehr Stellen würden
  // eine Genauigkeit vortäuschen, die die Token-Zählung nicht hergibt.
  return `${amount.toFixed(2).replace(".", ",")} ${currency}`
}
