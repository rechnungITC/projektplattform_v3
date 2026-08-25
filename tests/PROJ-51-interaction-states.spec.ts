/**
 * PROJ-51 — Interaktions- und Motion-Zustände, gemessen statt begutachtet.
 *
 * Diese Datei entsteht im rückwirkenden `/qa`-Durchgang (2026-08-24). PROJ-51
 * war seit 2026-05-07 in Produktion, ohne dass eines seiner 25 Kriterien
 * bewertet wurde; die Begründung im Register lautete, die Kriterien seien
 * Urteilsfragen. Für den größeren Teil trägt das nicht: Konsistenz von
 * Hover/Active/Focus-visible/Disabled entsteht in EINER cva-Basisklasse
 * (`buttonVariants`), und ob eine Animation läuft, ist am `getComputedStyle`
 * des ausgelieferten Stylesheets ablesbar.
 *
 * Was hier NICHT geprüft wird: ob die Oberfläche „moderner wirkt" (AC der
 * User-Story-Ebene) und ob Schatten *gestalterisch* richtig sitzen — dafür
 * gibt es die Visual-Regression-Suiten plus ein menschliches Urteil.
 *
 * Jeder Block trägt ein Paar aus Positiv- und Gegenkontrolle. Ohne die
 * Gegenkontrolle beweist „kein Unterschied messbar" nichts: es könnte auch
 * heißen, dass die Sonde am falschen Element hängt.
 */

import { expect, test } from "@playwright/test"

test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Mobile-Safari-WebKit ist auf diesem Host env-deaktiviert (PROJ-67/F2).",
)

/** Der Anmeldeknopf ist die einzige `Button`-Instanz ohne Sitzung. */
const PRIMARY_BUTTON = 'button[type="submit"]'

test.describe("PROJ-51 AC-12 — Interaktionszustände des Buttons", () => {
  test("Hover ändert die Fläche, Focus-visible setzt einen Ring, Disabled dimmt und sperrt Zeiger", async ({
    page,
  }) => {
    await page.goto("/login")
    const button = page.locator(PRIMARY_BUTTON).first()
    await expect(button).toBeVisible()

    const idle = await button.evaluate((el) => {
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, shadow: s.boxShadow }
    })

    await button.hover()
    const hovered = await button.evaluate((el) => {
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, shadow: s.boxShadow }
    })

    // AC-12 Hover: die Fläche muss sich sichtbar ändern — Farbe ODER Schatten.
    // Beides zu fordern wäre zu streng (`ghost`/`outline` tragen bewusst
    // keinen Schatten), keines zu fordern wäre keine Zusicherung.
    expect(
      hovered.bg !== idle.bg || hovered.shadow !== idle.shadow,
      `Hover ohne messbare Wirkung: bg ${idle.bg} → ${hovered.bg}, shadow ${idle.shadow} → ${hovered.shadow}`,
    ).toBe(true)

    // AC-12 Focus-visible: der Ring darf bei TASTATUR-Fokus erscheinen und
    // bei Maus-Fokus ausbleiben — genau das unterscheidet `focus-visible` von
    // `focus`. Programmatisches `focus()` taugt dafür nicht: Chromium wendet
    // `:focus-visible` auf einen so fokussierten Knopf nicht an.
    await page.mouse.move(0, 0)
    let keyboardFocused = false
    for (let i = 0; i < 12 && !keyboardFocused; i++) {
      await page.keyboard.press("Tab")
      keyboardFocused = await button.evaluate(
        (el) => document.activeElement === el,
      )
    }
    expect(
      keyboardFocused,
      "Anmeldeknopf ist per Tab nicht erreichbar — Tastaturbedienung gebrochen",
    ).toBe(true)
    const keyboardRing = await button.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    )
    expect(
      keyboardRing,
      "Tastaturfokus erzeugt keinen Ring (focus-visible greift nicht)",
    ).not.toBe("none")

    // Gegenkontrolle: nach einem Mausklick trägt derselbe Knopf den Ring
    // nicht. Ohne diese Hälfte wäre nicht unterscheidbar, ob `focus-visible`
    // oder schlicht `focus` gestylt ist.
    // Maus-Fokus ohne Klick: `mousedown` fokussiert den Knopf in Chromium,
    // das `mouseup` fällt bewusst neben das Element, damit kein Submit
    // ausgelöst wird (der Test soll nicht anmelden).
    const box = await button.boundingBox()
    if (!box) throw new Error("Anmeldeknopf hat keine Geometrie")
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(0, 0)
    await page.mouse.up()
    const mouseRing = await button.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    )
    expect(
      mouseRing === "none" || mouseRing !== keyboardRing,
      `Maus-Fokus zeigt denselben Ring wie Tastaturfokus (${mouseRing}) — dann ist es \`focus\`, nicht \`focus-visible\``,
    ).toBe(true)

    // AC-12 Disabled: gedimmt UND nicht klickbar. Nur die Opazität zu prüfen
    // würde einen Knopf durchgehen lassen, der blass aussieht und trotzdem
    // feuert.
    // `transition-all duration-150` animiert auch die Opazität: unmittelbar
    // nach dem Setzen liefert getComputedStyle noch den Startwert 1. Der
    // erste Entwurf dieses Tests hat genau daran einen Produktfehler
    // gemeldet, den es nicht gibt — deshalb wird die Transition abgewartet.
    const disabled = await button.evaluate(async (el) => {
      ;(el as HTMLButtonElement).disabled = true
      await new Promise((r) => setTimeout(r, 300))
      const s = getComputedStyle(el)
      return { opacity: s.opacity, pointerEvents: s.pointerEvents }
    })
    expect(Number(disabled.opacity)).toBeCloseTo(0.5, 2)
    expect(disabled.pointerEvents).toBe("none")
  })
})

test.describe("PROJ-51 AC-20 — prefers-reduced-motion", () => {
  test("Der Transitions-Anteil des Guards greift: unter reduzierter Bewegung werden nur noch Farben animiert", async ({
    browser,
  }) => {
    // Positiv-Hälfte des Guards. `motion-reduce:transition-colors` hat
    // dieselbe Spezifität wie das `transition-all` der Basis und steht in der
    // Ausgabe dahinter — greift also. Das isoliert Befund F-2 unten auf den
    // Transform-Anteil, statt „reduced motion ist kaputt" zu suggerieren.
    const context = await browser.newContext({ reducedMotion: "reduce" })
    const page = await context.newPage()
    await page.goto("/login")
    const button = page.locator(PRIMARY_BUTTON).first()
    await expect(button).toBeVisible()
    const property = await button.evaluate(
      (el) => getComputedStyle(el).transitionProperty,
    )
    await context.close()
    expect(property).not.toBe("all")
    expect(property).toContain("color")
  })

  // BEFUND F-2 dieses QA-Durchgangs (Medium, Barrierefreiheit) — bewusst als
  // `test.fail()` kodiert: der Test beschreibt den SOLL-Zustand, ist heute
  // rot und gilt damit als erwartet fehlschlagend. Wird der Defekt behoben,
  // schlägt der Lauf an und verlangt das Entfernen dieser Markierung. Die
  // Alternative — den Ist-Zustand zuzusichern — hätte den Fehler zementiert.
  //
  // Ursache gemessen, nicht vermutet: `active:scale-[0.98]` gibt
  // `.active\:scale-\[0\.98\]:active` aus (Spezifität 0,2,0),
  // `motion-reduce:transform-none` gibt `.motion-reduce\:transform-none`
  // innerhalb der Media-Query aus (0,1,0). Die Zustandsregel gewinnt
  // unabhängig von der Reihenfolge. Im Kontrollexperiment mit angeglichener
  // Spezifität (`…:disabled` innerhalb der Media-Query) kippt das Ergebnis
  // sofort auf `none`. Die tragfähige Form wäre `motion-reduce:active:scale-100`.
  test("Press-Feedback muss unter reduzierter Bewegung ausbleiben", async ({
    browser,
  }) => {
    test.fail(
      true,
      "PROJ-51 F-2: motion-reduce:transform-none kann active:scale-[0.98] wegen geringerer Spezifität nicht überschreiben",
    )
    async function transformWhilePressed(
      reducedMotion: "reduce" | "no-preference",
    ) {
      const context = await browser.newContext({ reducedMotion })
      const page = await context.newPage()
      await page.goto("/login")
      const button = page.locator(PRIMARY_BUTTON).first()
      await expect(button).toBeVisible()
      const box = await button.boundingBox()
      if (!box) throw new Error("Anmeldeknopf hat keine Geometrie")
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      const transform = await button.evaluate(
        (el) => getComputedStyle(el).transform,
      )
      await page.mouse.up()
      await context.close()
      return transform
    }

    // Gegenkontrolle zuerst: ohne die Präferenz MUSS skaliert werden, sonst
    // prüft die Zusicherung darunter nur die Abwesenheit von etwas, das es
    // nie gab.
    const pressedFullMotion = await transformWhilePressed("no-preference")
    expect(
      pressedFullMotion,
      "Ohne reduzierte Bewegung skaliert der Button beim Drücken nicht — die Sonde greift ins Leere",
    ).not.toBe("none")

    const pressedReduced = await transformWhilePressed("reduce")
    expect(pressedReduced).toBe("none")
  })

  // BEFUND F-1 dieses QA-Durchgangs (Medium) — ebenfalls `test.fail()`:
  // `tailwindcss-animate` ist keine Abhängigkeit und `tailwind.config.ts`
  // hat `plugins: []`, also existieren `animate-in`, `fade-in-0`,
  // `zoom-in-95` und `slide-in-from-*` im ausgelieferten Stylesheet nicht —
  // obwohl 9 Dateien sie an 109 Stellen tragen. Dialog, Sheet, Select,
  // Popover, Dropdown, Toast, Alert-Dialog und Navigation-Menu erscheinen
  // deshalb ohne jede Ein-/Ausblendung. Im Kompilat existieren genau vier
  // Keyframes (accordion-down/-up, pulse, spin).
  test("Die Enter-Klassen der Radix-Primitiven müssen eine Animation erzeugen", async ({
    page,
  }) => {
    test.fail(
      true,
      "PROJ-51 F-1: tailwindcss-animate fehlt, die animate-in/zoom/slide-Utilities existieren nicht im Kompilat",
    )
    await page.goto("/login")
    const probe = await page.evaluate(() => {
      function animationOf(classes: string) {
        const el = document.createElement("div")
        el.className = classes
        el.setAttribute("data-state", "open")
        document.body.appendChild(el)
        const s = getComputedStyle(el)
        const result = { name: s.animationName, duration: s.animationDuration }
        el.remove()
        return result
      }
      return {
        // Wortgleich die Klassen aus `DialogContent`.
        radixEnter: animationOf(
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        ),
        // Positivkontrolle: eine Kern-Utility, die es gibt.
        pulse: animationOf("animate-pulse"),
      }
    })

    // Positivkontrolle zuerst — schlägt sie fehl, ist die Sonde kaputt und
    // der Negativbefund darunter wertlos.
    expect(
      probe.pulse.name,
      "Positivkontrolle animate-pulse liefert keine Animation — die Sonde misst nicht das echte Stylesheet",
    ).not.toBe("none")

    expect(probe.radixEnter.name).not.toBe("none")
  })
})

test.describe("PROJ-51 AC-16 — kein horizontaler Überlauf", () => {
  for (const [label, width, height] of [
    ["mobil", 375, 812],
    ["tablet", 768, 1024],
    ["desktop", 1440, 900],
  ] as const) {
    test(`/login und /signup laufen bei ${width}px (${label}) nicht seitlich über`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      for (const path of ["/login", "/signup"]) {
        await page.goto(path)
        await page.waitForLoadState("networkidle")
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
          }
        })
        // 1px Toleranz für Sub-Pixel-Rundung bei fraktionalen Layouts.
        expect(
          overflow.scrollWidth,
          `${path} bei ${width}px: scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1)
      }
    })
  }
})
