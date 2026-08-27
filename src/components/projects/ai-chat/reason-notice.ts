/**
 * PROJ-151-α — den `reason_code` in eine Meldung übersetzen (AC-151.11).
 *
 * Ohne das steht bei einer leeren Antwort nur eine leere Fläche — und die ist
 * von „das Modell hatte nichts zu sagen" nicht zu unterscheiden. Genau diese
 * Ununterscheidbarkeit war der Anlass für PROJ-137.
 */

export interface ReasonNotice {
  title: string
  body: string
}

export function reasonToNotice(result: {
  status: string
  reason_code: string | null
  answer_text: string
}): ReasonNotice | null {
  // Eine echte, nicht-leere Antwort braucht keinen Hinweis.
  if (result.reason_code === null && result.answer_text.trim().length > 0) return null

  switch (result.reason_code) {
    case "no_provider":
      return {
        title: "Kein KI-Anbieter hinterlegt",
        body: "Für diesen Arbeitsbereich ist kein Anbieter eingerichtet. Eine Administratorin kann das in den Einstellungen nachholen.",
      }
    case "class3_blocked":
      return {
        title: "Nicht an ein externes Modell gesendet",
        body: "Die Eingabe enthält vermutlich personenbezogene Daten. Sie darf nur an ein lokales oder eigens freigegebenes Modell gehen — ein solches ist gerade nicht erreichbar.",
      }
    case "cost_cap_exceeded":
      return {
        title: "Kostengrenze erreicht",
        body: "Das Budget dieses Arbeitsbereichs für KI-Anfragen ist ausgeschöpft. Der bisherige Verlauf bleibt lesbar.",
      }
    case "provider_error":
      return {
        title: "Der Anbieter hat nicht geantwortet",
        body: "Die Frage bleibt erhalten und kann erneut gesendet werden.",
      }
    case "external_ai_disabled":
      return {
        title: "Externe KI ist abgeschaltet",
        body: "Dieser Arbeitsbereich läuft ohne externe Modelle.",
      }
    default:
      // Leere Antwort ohne Grund: das ist selten, aber es zu verschweigen wäre
      // schlimmer als eine unscharfe Meldung.
      if (result.answer_text.trim().length === 0) {
        return {
          title: "Keine Antwort erhalten",
          body: "Es kam kein Text zurück. Versuch es bitte erneut.",
        }
      }
      return null
  }
}
