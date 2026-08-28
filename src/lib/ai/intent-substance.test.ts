/**
 * PROJ-153-α — Tests für das Substanz-Tor.
 *
 * Was hier bewacht wird, ist keine Formatierung, sondern die **eine
 * Entscheidung**, die diesen Zweck von einem Rückfall in PROJ-91 trennt: ob
 * überhaupt genug da ist, um zu extrahieren statt zu erfinden.
 *
 * Die Fälle sind gegen die **gemessene** Prod-Lage geschrieben (2026-08-27,
 * 31 lebende Projekte: 5 mit Vorhaben, Ø 47 Zeichen, max 97) — nicht gegen
 * ausgedachte Eingaben.
 */

import { describe, expect, it } from "vitest"

import {
  INTENT_MIN_ANSWERED_QUESTIONS,
  INTENT_MIN_HUMAN_CHARS,
  assessIntentSubstance,
  describeSubstanceRejection,
} from "./intent-substance"

const long = (n: number) => "a".repeat(n)

describe("assessIntentSubstance", () => {
  it("lehnt das längste Vorhaben ab, das heute in Produktion existiert", () => {
    // 97 Zeichen — das Maximum über alle 31 Projekte. Wenn dieser Fall
    // durchginge, wäre das Tor wirkungslos für den gesamten Bestand.
    const verdict = assessIntentSubstance(long(97))
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toBe("intent_too_thin")
  })

  it("lehnt ein fehlendes Vorhaben mit EIGENEM Grund ab", () => {
    // Eigener Code, weil der nächste Schritt ein anderer ist: „schreiben Sie
    // mehr" gegen „legen Sie überhaupt eines an".
    for (const empty of [null, undefined, "", "   "]) {
      const verdict = assessIntentSubstance(empty)
      expect(verdict.ok).toBe(false)
      expect(verdict.reason).toBe("intent_missing")
    }
  })

  it("lässt ein Vorhaben durch, das allein trägt — auch ohne Antworten", () => {
    // Der α-Pfad: ohne Dialogrunde ist das der EINZIGE Weg durchs Tor.
    const verdict = assessIntentSubstance(long(INTENT_MIN_HUMAN_CHARS))
    expect(verdict.ok).toBe(true)
    expect(verdict.reason).toBeNull()
  })

  it("zählt Modellausgabe nicht mit — es zählt nur, was der Mensch schrieb", () => {
    // Die Signatur lässt gar nichts anderes zu: `answers` trägt nur
    // menschliche Beiträge. Der Fall pinnt, dass übersprungene Fragen (null)
    // weder Zeichen noch Antwortzahl beisteuern — sonst könnte sich ein Lauf
    // über leere Runden selbst über die Schwelle heben.
    const verdict = assessIntentSubstance(long(100), [
      { answer: null },
      { answer: "   " },
      { answer: null },
      { answer: null },
    ])
    expect(verdict.answeredCount).toBe(0)
    expect(verdict.humanChars).toBe(100)
    expect(verdict.ok).toBe(false)
  })

  it("verlangt BEIDE Tore: viele kurze Antworten reichen nicht", () => {
    // Vier beantwortete Fragen (Eigenbeitrag erfüllt), aber zusammen weit
    // unter der Zeichengrenze. Ein einzelnes Tor hätte das durchgelassen.
    const answers = Array.from({ length: INTENT_MIN_ANSWERED_QUESTIONS }, () => ({
      answer: "ja",
    }))
    const verdict = assessIntentSubstance(long(50), answers)
    expect(verdict.answeredCount).toBe(INTENT_MIN_ANSWERED_QUESTIONS)
    expect(verdict.ok).toBe(false)
  })

  it("verlangt BEIDE Tore: viel Text ohne Eigenbeitrag reicht auch nicht", () => {
    // Gegenrichtung: Zeichengrenze über Antworten erreicht, aber zu wenige
    // beantwortete Fragen UND ein Vorhaben, das allein nicht trägt.
    const verdict = assessIntentSubstance(long(100), [
      { answer: long(INTENT_MIN_HUMAN_CHARS) },
    ])
    expect(verdict.humanChars).toBeGreaterThanOrEqual(INTENT_MIN_HUMAN_CHARS)
    expect(verdict.answeredCount).toBe(1)
    expect(verdict.ok).toBe(false)
  })

  it("lässt Vorhaben plus genug beantwortete Rückfragen durch (der β-Pfad)", () => {
    const per = Math.ceil(INTENT_MIN_HUMAN_CHARS / INTENT_MIN_ANSWERED_QUESTIONS)
    const answers = Array.from({ length: INTENT_MIN_ANSWERED_QUESTIONS }, () => ({
      answer: long(per),
    }))
    const verdict = assessIntentSubstance(long(97), answers)
    expect(verdict.ok).toBe(true)
  })
})

describe("describeSubstanceRejection", () => {
  it("nennt die Zahl — eine Absage ohne Zahl lässt den Nutzer raten", () => {
    const verdict = assessIntentSubstance(long(97))
    const msg = describeSubstanceRejection(verdict)
    expect(msg).toContain("97")
    expect(msg).toContain(String(INTENT_MIN_HUMAN_CHARS))
  })

  it("sagt beim fehlenden Vorhaben etwas ANDERES als beim zu kurzen", () => {
    // Ohne diesen Fall könnten beide Zweige denselben Text liefern und der
    // eigene Grund-Code wäre dekorativ.
    const missing = describeSubstanceRejection(assessIntentSubstance(null))
    const thin = describeSubstanceRejection(assessIntentSubstance(long(97)))
    expect(missing).not.toBe(thin)
    expect(missing).toMatch(/kein Vorhaben hinterlegt/)
  })
})
