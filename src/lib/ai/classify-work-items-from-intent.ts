/**
 * PROJ-153-α — Schutzklasse für die Generierung aus dem Vorhaben.
 *
 * **Inhaltsbasiert, kein Class-3-Pin.** Ein Pin (wie bei PROJ-88) würde den
 * Zweck ohne tenant-eigenes Ollama unbenutzbar machen; ein Vorhaben ist in der
 * Regel eine Zielbeschreibung ohne Personendaten. Enthält es welche, greift der
 * Gate wie überall — über den Standard-Resolver, nicht über eine Sonderregel.
 *
 * **Der Unterschied zu allen Geschwistern steht in der Aufzählung unten: die
 * Skill-Anweisungen werden mitgelesen** (CIA-Auflage A-1).
 *
 * Der CIA-Pass zu Q3 hat gemessen, dass `classifyProjectChatAutoContext`
 * (PROJ-151) `project.description` und den Verlauf klassifiziert, die
 * **Skill-Anweisungen aber nicht** — obwohl `project-chat-runner.ts` sie als
 * Teil des System-Prompts an den Anbieter schickt. Personendaten in einem Skill
 * erreichen dort also ein Cloud-Modell, ohne dass der Gate greift. Für
 * Invariante #3 („kein Bypass, auch nicht für Mandanten-Administratoren") ist
 * „daran vorbei" derselbe Bruch wie „ausgehebelt".
 *
 * Diese Datei erbt den Fehler nicht. Die Lücke in PROJ-151 selbst ist als
 * **PROJ-Y-151d** registriert und bewusst dort zu beheben — eine fremde,
 * ausgelieferte Slice repariert man nicht nebenbei.
 *
 * **Merkregel für jeden künftigen Zweck:** was in den Prompt geht, muss in die
 * Klassifizierung. Beides steht hier absichtlich untereinander.
 */

import { detectClass3Markers } from "./classify"
import type { DataClass } from "./types"

export interface WorkItemsFromIntentAutoContext {
  project: {
    id: string
    name: string
    /** Das Vorhaben — hier ausdrücklich die QUELLE, nicht nur der Maßstab. */
    description: string | null
    project_type: string | null
    project_method: string | null
  }
  /** Antworten der Dialogrunde. In α immer leer (die Runde kommt mit β). */
  answers: readonly { question: string; answer: string | null }[]
  /** Zusammengefasste Anweisungen der aktiven Projekt-Skills, oder null. */
  skill_instructions: string | null
}

/**
 * Schutzklasse für den Router.
 *
 * Gelesen wird **alles, was der Anbieter zu sehen bekommt** — Vorhaben,
 * Dialogantworten und Skill-Anweisungen. Die Mandanten-Voreinstellung ist die
 * Untergrenze und kann nur angehoben, nie unterschritten werden (Muster
 * PROJ-89).
 */
export function classifyWorkItemsFromIntentAutoContext(
  context: WorkItemsFromIntentAutoContext,
  privacyDefault: DataClass,
): DataClass {
  const haystack = [
    context.project.description ?? "",
    ...context.answers.flatMap((a) => [a.question, a.answer ?? ""]),
    // CIA A-1: geht in den Prompt, muss also in die Klassifizierung.
    context.skill_instructions ?? "",
  ].join("\n")

  if (detectClass3Markers(haystack)) return 3

  return privacyDefault
}
