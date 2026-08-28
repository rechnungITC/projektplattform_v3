/**
 * PROJ-151-α — Schutzklasse einer Chat-Eingabe.
 *
 * Inhaltsbasiert wie PROJ-89, **kein** fester Class-3-Pin wie bei
 * `resource_swap`/`proposal_stakeholders_from_context`: ein Chat-Verlauf ist
 * nicht per Konstruktion personenbezogen — die meisten Fragen betreffen Termine,
 * Status und Arbeitspakete. Ein Pin hätte jeden Chat auf lokale Modelle gezwungen
 * und ihn ohne Ollama unbenutzbar gemacht.
 *
 * Freitext bleibt trotzdem ein Class-3-Magnet (Spec-Risiko R-4), deshalb läuft
 * jede Eingabe UND der bisherige Verlauf durch den Detektor — nicht nur die
 * jüngste Nachricht: wer im dritten Satz eine Telefonnummer nennt, darf nicht
 * dadurch an ein externes Modell geraten, dass der vierte harmlos ist.
 */

import { detectClass3Markers } from "./classify"
import type { DataClass } from "./types"
import type { ProjectChatAutoContext } from "./types"

/**
 * Ergebnis der Prüfung einer einzelnen Eingabe — für die Warnung VOR dem
 * Senden (Lock L3). Die Warnung hält niemanden auf; sie sagt nur, was gleich
 * passiert.
 */
export interface ProjectChatInputCheck {
  /** True, wenn der Detektor angeschlagen hat. */
  looks_personal: boolean
}

/**
 * `detectClass3Markers` (PROJ-86) liefert nur ja/nein, keine Marker-Liste. Die
 * Warnung nennt deshalb die Kategorie nicht — sie zu erraten wäre schlechter
 * als sie wegzulassen, und die Funktion dafür zu erweitern hieße, an einem
 * gehärteten Klassifizierer zu schrauben, dessen Fehlalarmquote PROJ-86 mühsam
 * gesenkt hat.
 */
export function checkProjectChatInput(text: string): ProjectChatInputCheck {
  return { looks_personal: detectClass3Markers(text) }
}

/**
 * Schutzklasse für den Router. Berücksichtigt Verlauf, Projektangaben **und**
 * Skill-Anweisungen — die Regel ist einfach: was an den Anbieter geht, wird
 * klassifiziert (AC-151.8, „jede Eingabe"). Alles andere waere ein Weg am Tor
 * vorbei statt durch es hindurch.
 */
export function classifyProjectChatAutoContext(
  context: ProjectChatAutoContext,
  privacyDefault: DataClass,
): DataClass {
  const haystack = [
    context.project.description ?? "",
    ...context.history.map((m) => m.content),
    // PROJ-Y-151e — die Skill-Anweisungen gehoeren dazu, weil sie an den
    // Anbieter GEHEN: `buildProjectChatContextBlock` haengt sie in den
    // System-Prompt (project-chat-runner.ts). Fehlten sie hier, koennte eine
    // Mandanten-Administration Personendaten in einen Skill schreiben und sie
    // erreichten ein Cloud-Modell, OHNE dass der Class-3-Gate greift — der
    // Skill hebelt das Tor nicht aus, er geht daran vorbei, und fuer
    // Invariante #3 ("no bypass, even for tenant admins") ist das derselbe
    // Bruch. Gefunden im CIA-Pass zu PROJ-153/Q3.
    context.skill_instructions ?? "",
  ].join("\n")

  if (detectClass3Markers(haystack)) return 3

  // Untergrenze aus der Mandanten-Voreinstellung — nie darunter (Muster PROJ-89).
  return privacyDefault
}
