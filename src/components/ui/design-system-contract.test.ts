/**
 * PROJ-51 — Vertrag des Design-Systems, als Test statt als Zusicherung in Prosa.
 *
 * Entstanden im rückwirkenden `/qa`-Durchgang (2026-08-24). Die Kriterien
 * AC-12 (konsistente Hover-/Active-/Focus-visible-/Disabled-Zustände) und
 * AC-14 (konsistente Radius-/Border-/Shadow-/Spacing-Tokens) galten als
 * Urteilsfragen. Das trifft für ihren Kern nicht zu: Konsistenz entsteht hier
 * nicht pro Aufrufstelle, sondern in EINER cva-Basisklasse und in EINEM
 * geteilten Token-Satz. Ob die Basis alle Zustände trägt und ob die drei
 * Formular-Primitiven denselben Satz benutzen, ist prüfbar — und driftet
 * sonst still, weil jede neue Variante nur eine Zeile in einer Map ist.
 *
 * Was dieser Test NICHT behauptet: dass die Zustände gut AUSSEHEN. Das messen
 * die Visual-Regression-Suiten plus ein menschliches Urteil; hier geht es um
 * Vollständigkeit und Einheitlichkeit.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { badgeVariants } from "./badge"
import { buttonVariants } from "./button"

const BUTTON_VARIANTS = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "success",
  "warning",
  "info",
  "risk-low",
  "risk-medium",
  "risk-high",
  "risk-critical",
] as const

/** Die semantischen Status-Varianten aus γ.1 folgen einem Muster. */
const SEMANTIC_BADGE_TOKENS = [
  "success",
  "warning",
  "info",
  "risk-low",
  "risk-medium",
  "risk-high",
  "risk-critical",
] as const

describe("PROJ-51 AC-12 — Button trägt alle vier Zustände in jeder Variante", () => {
  it.each(BUTTON_VARIANTS)(
    "Variante %s definiert einen Hover-Zustand",
    (variant) => {
      // Hover ist die einzige der vier Zustandsarten, die pro Variante
      // definiert werden MUSS (die Fläche unterscheidet sich je Variante).
      // Genau deshalb ist sie die, die beim Hinzufügen einer Variante
      // vergessen wird.
      expect(buttonVariants({ variant })).toMatch(/hover:/)
    },
  )

  it.each(BUTTON_VARIANTS)(
    "Variante %s erbt Focus-visible-Ring und Disabled-Sperre aus der Basis",
    (variant) => {
      const classes = buttonVariants({ variant })
      expect(classes).toContain("focus-visible:ring-2")
      expect(classes).toContain("focus-visible:ring-ring")
      // Beides zusammen: gedimmt UND nicht klickbar. Nur eines davon wäre ein
      // Knopf, der blass aussieht und trotzdem feuert (oder umgekehrt).
      expect(classes).toContain("disabled:opacity-50")
      expect(classes).toContain("disabled:pointer-events-none")
    },
  )

  it("Press-Feedback steht motion-safe-gekapselt an den Varianten, nicht in der Basis", () => {
    // PROJ-Y-51c: vorher stand `active:scale-[0.98]` in der Basis und `link`
    // nahm sich per `active:scale-100` aus. Beide Zusagen hielten nicht —
    // Gleichstand der Spezifität (0,2,0), entschieden über die Quellreihenfolge
    // im Kompilat. Jetzt gibt es keine konkurrierende Regel mehr.
    //
    // ACHTUNG bei Erweiterungen: diese Prüfung sieht nur, DASS die Utility da
    // steht — nicht, dass sie gewinnt. Genau diese Lücke hat F-2 und F-4
    // entstehen lassen. Der Verhaltensnachweis liegt in
    // `tests/PROJ-51-interaction-states.spec.ts` und drückt echte Knöpfe.
    const PRESS = "motion-safe:active:scale-[0.98]"
    for (const variant of BUTTON_VARIANTS) {
      const classes = buttonVariants({ variant })
      if (variant === "link") {
        // Ein Textlink soll nicht springen. Der Opt-out ist die ABWESENHEIT
        // jeder Skalierungs-Utility — Abwesenheit kann keine Kaskade verlieren.
        expect(classes, "link trägt wieder eine Skalierungs-Utility").not.toMatch(
          /scale-/,
        )
      } else {
        expect(classes, `Variante ${variant} ohne Press-Feedback`).toContain(
          PRESS,
        )
      }
    }
  })

  it("die widerlegten Überschreibungen sind aus dem Code verschwunden, nicht neu ausbalanciert", () => {
    // Eine Klasse, die nachweislich nichts tut, im Code zu lassen wäre eine
    // falsche Zusage — deshalb wird ihre Abwesenheit festgeschrieben.
    for (const variant of BUTTON_VARIANTS) {
      const classes = buttonVariants({ variant })
      expect(classes).not.toContain("motion-reduce:transform-none")
      expect(classes).not.toContain("active:scale-100")
    }
    // Der Transitions-Anteil des Guards greift dagegen (gemessen) und bleibt.
    expect(buttonVariants({ variant: "default" })).toContain(
      "motion-reduce:transition-colors",
    )
  })

})

describe("PROJ-51 AC-14 — Badge-Varianten folgen einem Muster", () => {
  it.each(BADGE_VARIANTS)(
    "Variante %s erbt Radius, Border und Focus-Ring aus der Basis",
    (variant) => {
      const classes = badgeVariants({ variant })
      expect(classes).toContain("rounded-full")
      expect(classes).toContain("border")
      expect(classes).toContain("focus:ring-2")
    },
  )

  it.each(SEMANTIC_BADGE_TOKENS)(
    "Status-Variante %s folgt dem dokumentierten bg/10 · text · border/20-Muster",
    (token) => {
      const classes = badgeVariants({
        variant: token as (typeof BADGE_VARIANTS)[number],
      })
      expect(classes).toContain(`bg-${token}/10`)
      expect(classes).toContain(`text-${token}`)
      expect(classes).toContain(`border-${token}/20`)
    },
  )
})

describe("PROJ-51 AC-14 — die Formular-Primitiven teilen EINEN Zustands- und Spacing-Satz", () => {
  // Gelesen wird die Quelldatei, nicht das gerenderte Ergebnis: `SelectTrigger`
  // braucht einen Radix-Kontext, und der Vertrag, um den es geht, steht in der
  // Klassenliste — nicht im DOM. Präzedenz für strukturelle Verträge als Test:
  // `audit-report-view.contract.test.ts` (PROJ-Y-130p).
  const SHARED_TOKENS = [
    "rounded-md",
    "border border-input",
    "bg-background",
    "px-3 py-2",
    "ring-offset-background",
    "ring-2",
    "ring-ring",
    "ring-offset-2",
    "disabled:cursor-not-allowed",
    "disabled:opacity-50",
  ]

  const PRIMITIVES = ["input.tsx", "textarea.tsx", "select.tsx"] as const

  it.each(PRIMITIVES)("%s trägt den geteilten Token-Satz", (file) => {
    const source = readFileSync(join(__dirname, file), "utf8")
    for (const token of SHARED_TOKENS) {
      expect(source, `${file} ohne "${token}"`).toContain(token)
    }
  })

  it("Dialog und Sheet teilen den Backdrop-Behandlung aus γ.4", () => {
    for (const file of ["dialog.tsx", "sheet.tsx"]) {
      const source = readFileSync(join(__dirname, file), "utf8")
      expect(source, `${file} ohne Backdrop-Blur`).toContain("backdrop-blur-sm")
      expect(source, `${file} mit altem opaken Backdrop`).not.toContain(
        "bg-black/80",
      )
    }
  })
})
