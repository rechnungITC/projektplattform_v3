/**
 * PROJ-153-α — das Substanz-Tor vor der Generierung.
 *
 * **Warum es das gibt.** Dieser Zweck kehrt die PROJ-91-Invariante um: hier ist
 * das Vorhaben die Quelle. Genau daran ist die erste Fassung von PROJ-91 live
 * gescheitert — aus einem Zielsatz erfand das Modell einen plausiblen Backlog
 * (8 von 8 Items, Traceability-Verstoß). Der Unterschied zwischen „extrahieren"
 * und „erfinden" hängt nicht am Prompt, sondern daran, **ob überhaupt etwas da
 * ist, aus dem man extrahieren kann**.
 *
 * **Die Messung, die die Zahlen begründet** (Prod, 2026-08-27, 31 lebende
 * Projekte): nur 5 tragen ein Vorhaben, im Schnitt **47** Zeichen, das längste
 * **97**. Ein echtes Kickoff-Dokument liefert dagegen Tausende. Zwischen dem,
 * was heute da ist, und dem, was der Kickoff-Pfad bekommt, liegen **zwei
 * Größenordnungen**.
 *
 * **Zwei Tore statt einem, und beide zählen nur menschlich geschriebenen Text.**
 * Eine reine Zeichenzahl bestünde auch mit Füllmaterial; eine reine Antwortzahl
 * bestünde auch mit sechs Ein-Wort-Antworten. Modellausgabe zählt **nie** mit —
 * sonst höbe sich der Vorgang durch Erfundenes selbst über die Schwelle.
 *
 * **Warum die Schwelle hier steht und nicht im Prompt.** Ein Projekt-Skill darf
 * bestimmen, *was* generiert wird (Lock L3). Stünde die Untergrenze im Prompt,
 * könnte ein Skill sie wegschreiben — dann wäre sie eine Bitte, keine Grenze.
 * Im Code ist sie aus keinem Skill erreichbar (CIA-Auflage A-5, Linie).
 */

/**
 * Mindestlänge des vom Menschen geschriebenen Textes (Vorhaben + Antworten).
 *
 * Nutzer-Entscheid 2026-08-28: **streng** (800) statt großzügig (400). Bei
 * heutiger Datenlage sagt das Tor für **jedes** bestehende Projekt ab, bis
 * jemand ausführlich schreibt — das ist gewollt und der Grund, warum die
 * Dialogrunde (β) folgt.
 *
 * **Startwert, kein Messergebnis.** Kalibriert wird in `/qa` an echten
 * Generierungen (AC-153.9).
 */
export const INTENT_MIN_HUMAN_CHARS = 800

/**
 * Mindestzahl **beantworteter** Rückfragen als Alternativpfad.
 *
 * In α ohne Wirkung: die Dialogrunde kommt erst mit β, `answers` ist hier immer
 * leer. Die Konstante steht trotzdem schon hier, damit β das Tor nicht neu
 * erfindet — und damit `/qa` die α-Absage gegen den vollständigen Regelsatz
 * prüfen kann statt gegen eine Teilfassung.
 */
export const INTENT_MIN_ANSWERED_QUESTIONS = 4

/** Ein vom Menschen geschriebener Beitrag. Modellausgabe gehört hier nie hinein. */
export interface HumanAnswer {
  /** Die Antwort. `null` bedeutet ausdrücklich übersprungen. */
  answer: string | null
}

export type SubstanceRejectionCode =
  /** Weder Vorhaben noch Antworten tragen genug Text. */
  | "intent_too_thin"
  /** Es gibt gar kein Vorhaben. Eigener Code, weil der nächste Schritt ein anderer ist. */
  | "intent_missing"

export interface SubstanceVerdict {
  ok: boolean
  /** Gezählte Zeichen menschlich geschriebenen Textes. */
  humanChars: number
  /** Beantwortete (nicht übersprungene, nicht leere) Rückfragen. */
  answeredCount: number
  reason: SubstanceRejectionCode | null
}

/** Zählt nur, was ein Mensch wirklich geschrieben hat. */
function usableLength(text: string | null | undefined): number {
  if (!text) return 0
  return text.trim().length
}

/**
 * Entscheidet, ob genug Substanz für eine Generierung vorliegt.
 *
 * Die Regel in einem Satz: **genug Text insgesamt UND (genug beantwortete
 * Rückfragen ODER ein Vorhaben, das schon allein trägt)**.
 *
 * Der zweite Teil ist der Grund für zwei Tore: ohne ihn käme ein langes, aber
 * dialogloses Vorhaben mit Füllmaterial durch; ohne den ersten kämen vier
 * Ein-Wort-Antworten durch.
 */
export function assessIntentSubstance(
  intent: string | null | undefined,
  answers: readonly HumanAnswer[] = [],
): SubstanceVerdict {
  const intentChars = usableLength(intent)

  const answered = answers.filter((a) => usableLength(a.answer) > 0)
  const answerChars = answered.reduce((sum, a) => sum + usableLength(a.answer), 0)

  const humanChars = intentChars + answerChars
  const answeredCount = answered.length

  if (intentChars === 0) {
    return { ok: false, humanChars, answeredCount, reason: "intent_missing" }
  }

  const enoughText = humanChars >= INTENT_MIN_HUMAN_CHARS
  const enoughOwnContribution =
    answeredCount >= INTENT_MIN_ANSWERED_QUESTIONS ||
    intentChars >= INTENT_MIN_HUMAN_CHARS

  if (!enoughText || !enoughOwnContribution) {
    return { ok: false, humanChars, answeredCount, reason: "intent_too_thin" }
  }

  return { ok: true, humanChars, answeredCount, reason: null }
}

/**
 * Sagt dem Nutzer, was fehlt — mit Zahlen.
 *
 * AC-153.10 verlangt, dass die Schwelle sichtbar ist. Eine Absage ohne Zahl
 * („zu wenig Inhalt") lässt den Nutzer raten, wie viel zu wenig; das ist die
 * häufigste Fläche dieser Funktion (30 von 31 Projekten heute) und darf
 * deshalb nicht die schlechteste sein.
 */
export function describeSubstanceRejection(verdict: SubstanceVerdict): string {
  if (verdict.reason === "intent_missing") {
    return (
      "Für dieses Projekt ist kein Vorhaben hinterlegt. Ohne eine Beschreibung " +
      "des Ziels gibt es nichts, woraus sich Arbeitspakete ableiten ließen — " +
      "die KI würde sie erfinden. Bitte tragen Sie das Vorhaben in den " +
      "Projektangaben nach."
    )
  }
  return (
    `Ihr Vorhaben umfasst ${verdict.humanChars} Zeichen; für belastbare ` +
    `Vorschläge werden ${INTENT_MIN_HUMAN_CHARS} benötigt. Aus einem Satz ` +
    "kann die KI nichts ableiten, sondern nur erfinden — deshalb wird hier " +
    "bewusst nicht generiert. Beschreiben Sie Ziel, Umfang und Rahmen des " +
    "Projekts ausführlicher."
  )
}
