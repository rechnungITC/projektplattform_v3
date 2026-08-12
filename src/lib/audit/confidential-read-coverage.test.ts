// @vitest-environment node
/**
 * PROJ-130-δ2 — Abdeckungs-Wächter für das Zugriffsprotokoll.
 *
 * Warum es diesen Test gibt: δ2 verdrahtet 17 Leseflächen. Ohne Wächter vergisst
 * die nächste neue vertrauliche Liste die Protokollierung — und niemand merkt es,
 * weil ein fehlender Eintrag nichts kaputt macht. Genau diese Krankheit behandelt
 * PROJ-130 (vier Register, die auseinanderdrifteten, weil jede Slice eines pflegte
 * und die anderen vergaß).
 *
 * Der Test prüft KEINE Vollständigkeit im Sinne von „alles ist protokolliert",
 * sondern dass für jede Lesefläche eine ENTSCHEIDUNG existiert: entweder sie
 * protokolliert, oder sie steht mit Grund in der Ausnahmeliste. Eine neue Fläche
 * ohne Entscheidung macht diesen Test rot.
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

const API_ROOT = join(process.cwd(), "src/app/api")
const APP_ROOT = join(process.cwd(), "src/app")
const HELPER_IMPORT = "@/lib/audit/confidential-read"

/**
 * Leseflächen, die bewusst NICHT protokollieren — mit Grund. Jeder Eintrag ist
 * eine veröffentlichte Aussage (Negativliste im Tech Design δ2), keine
 * Bequemlichkeit.
 */
const EXEMPT: Record<string, string> = {
  "projects/[id]/documents/tree/route.ts":
    "Baumansicht — dauerhafte Negativliste. Der Austritt derselben Inhalte ist über die Download-Route (δ1) protokolliert.",
  "projects/[id]/access-overview/route.ts":
    "Governance-Auskunft „wer darf was sehen“ — enthält keine Inhalte, sondern Berechtigungen.",
  "projects/[id]/access-explain/route.ts":
    "Governance-Auskunft „warum darf jemand das sehen“ — enthält keine Inhalte.",
  "projects/[id]/communication-entries/route.ts":
    "Eigenes Zugriffsprotokoll aus PROJ-119 (communication_access_log). Doppelte Protokollierung wäre ein zweites, driftendes Register.",
  "projects/[id]/communication-entries/[entryId]/export/route.ts":
    "Eigenes Zugriffsprotokoll aus PROJ-119 (communication_access_log).",
  "ma-project-templates/route.ts":
    "Mandanten-Katalog von Projektvorlagen — Vorlagen-Vorgabewerte, keine Projektinhalte.",
}

/** Auswertungs-RPCs: wer sie aufruft, liest eine ganze Auswertung. */
const REPORT_RPCS = ["steering_report", "operative_report", "dd_report_consolidated"]

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full, match))
    else if (match(entry)) out.push(full)
  }
  return out
}

const routeFiles = walk(
  API_ROOT,
  (f) => f === "route.ts" || f === "route.tsx"
).map((f) => ({ rel: relative(API_ROOT, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }))

describe("Zugriffsprotokoll: Abdeckung der Leseflächen", () => {
  it("findet überhaupt Routen (sonst prüft der Wächter nichts)", () => {
    expect(routeFiles.length).toBeGreaterThan(100)
  })

  it("jede lesende Route mit Vertraulichkeitsstufe protokolliert oder ist begründet ausgenommen", () => {
    const undecided: string[] = []

    for (const { rel, text } of routeFiles) {
      // Nur Leseflächen: ohne GET-Handler wird nichts gelesen (Schreibpfade
      // tragen ihre Nachvollziehbarkeit über den Feld-Audit aus α/β).
      if (!text.includes("export async function GET")) continue
      if (!text.includes("confidentiality_level")) continue
      if (text.includes(HELPER_IMPORT)) continue
      if (rel in EXEMPT) continue
      undecided.push(rel)
    }

    // Die Meldung nennt die Datei UND was zu tun ist — ein roter Test ohne
    // Handlungsanweisung wird sonst per Ausnahme „weggeklickt".
    expect(
      undecided,
      `Diese Leseflächen führen eine Vertraulichkeitsstufe, protokollieren aber nicht:\n` +
        undecided.map((f) => `  - ${f}`).join("\n") +
        `\n\nEntweder logConfidentialListRead(...) einbauen (PROJ-130-δ2) oder mit Grund in EXEMPT aufnehmen.`
    ).toEqual([])
  })

  it("die Ausnahmeliste ist gepflegt: kein Eintrag zeigt auf eine verschwundene Datei", () => {
    const known = new Set(routeFiles.map((r) => r.rel))
    for (const rel of Object.keys(EXEMPT)) {
      expect(known.has(rel), `EXEMPT verweist auf nicht existierende Route ${rel}`).toBe(true)
    }
  })

  it("die Ausnahmeliste enthält keine Fläche, die inzwischen doch protokolliert", () => {
    for (const { rel, text } of routeFiles) {
      if (!(rel in EXEMPT)) continue
      expect(
        text.includes(HELPER_IMPORT),
        `${rel} protokolliert jetzt — Eintrag aus EXEMPT entfernen`
      ).toBe(false)
    }
  })

  it("wer eine Auswertungs-RPC aufruft, protokolliert das Lesen", () => {
    const callers = walk(
      APP_ROOT,
      (f) => f.endsWith(".ts") || f.endsWith(".tsx")
    )
      .filter((f) => !f.includes(".test."))
      .map((f) => ({ rel: relative(APP_ROOT, f).replaceAll("\\", "/"), text: readFileSync(f, "utf8") }))
      .filter(({ text }) => REPORT_RPCS.some((rpc) => text.includes(`"${rpc}"`)))

    // 3 Daten-Routen + 2 CSV-Exporte + 3 Druckseiten
    expect(callers.map((c) => c.rel).sort()).toHaveLength(8)

    const missing = callers.filter((c) => !c.text.includes(HELPER_IMPORT)).map((c) => c.rel)
    expect(
      missing,
      `Diese Aufrufer lesen eine ganze Auswertung, protokollieren aber nicht:\n` +
        missing.map((f) => `  - ${f}`).join("\n")
    ).toEqual([])
  })
})
