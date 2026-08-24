import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * PROJ-Y-114e — Wächter gegen Oberflächentexte, die eine bereits ausgelieferte
 * Funktion als Zukunft ankündigen.
 *
 * Der konkrete Anlass: die DD-Übersicht trug vier Titel „Verfügbar mit
 * DD-Findings (PROJ-114)" bzw. „… DD-Q&A (PROJ-113)", während **beide** Slices
 * seit dem 2026-06-26 live waren. PROJ-Y-114a hat dieselbe Klasse Falschaussage
 * im Q&A-Blatt beseitigt und die Nachbarfläche übersehen — genau deshalb ist ein
 * Test hier mehr wert als eine Notiz: er fängt die Wiederholung, nicht den
 * einzelnen Fall.
 *
 * Absichtlich eng: geprüft wird nur die Wendung „Verfügbar mit" in `src/`.
 * Kommentare, die eine PROJ-ID nennen, sind legitim und massenhaft vorhanden —
 * ein breiterer Wächter wäre Rauschen und würde abgeschaltet.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe("Oberflächentexte kündigen keine live-Funktion als Zukunft an", () => {
  it("nirgends in src/ steht „Verfügbar mit …“", () => {
    const offenders = walk("src")
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      .filter((f) => readFileSync(f, "utf8").includes("Verfügbar mit"))
    expect(offenders).toEqual([])
  })
})
