/**
 * PROJ-80-α — Tests für die Projekt-Zugehörigkeit eines Dokuments.
 *
 * Diese Funktion ist der Sicherheitskern der Quintessenz-Routen: sie beantwortet
 * „darf dieser Aufrufer über DIESES Projekt an DIESES Dokument". Der Fall, der
 * ohne sie offen war (Bearbeitungsrecht in Projekt A, Schreibvorgang auf ein
 * Dokument aus Projekt B), ist unten Vektor „fremdes Projekt" — er ist der
 * Grund, dass es die Datei überhaupt gibt, und wird deshalb zuerst geprüft.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it, vi } from "vitest"

import {
  DOCUMENT_SCOPE_COLUMNS,
  resolveDocumentInProject,
  type SingleRowLookup,
} from "./document-scope"
import { SUMMARY_READ_COLUMNS } from "./summary-select"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
const OTHER_PROJECT = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
const DOC = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
const NODE = "dddddddd-4444-4444-8444-dddddddddddd"

/** Antwortet je Tabelle — genau die Aufteilung, die die Funktion nutzt. */
function lookupFor(rows: {
  documents?: unknown
  document_tree_nodes?: unknown
}): SingleRowLookup {
  return vi.fn(async (table: "documents" | "document_tree_nodes") => ({
    data: rows[table] ?? null,
  }))
}

const DOC_ROW = {
  id: DOC,
  tree_node_id: NODE,
  original_filename: "kickoff.pdf",
  mime_type: "application/pdf",
}

describe("PROJ-80 resolveDocumentInProject", () => {
  it("weist ein Dokument ab, dessen Knoten zu einem ANDEREN Projekt gehört", async () => {
    // Der tragende Vektor. Das Dokument ist für den Aufrufer sichtbar (die
    // Lese-Policy verlangt nur Mitgliedschaft im EIGENEN Projekt des
    // Dokuments) — trotzdem darf es über diesen Pfad nicht erreichbar sein,
    // weil das Recht am Projekt aus dem Pfad geprüft wurde.
    const scope = await resolveDocumentInProject(
      lookupFor({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: OTHER_PROJECT, confidentiality_level: "standard" },
      }),
      PROJECT,
      DOC,
    )
    expect(scope).toBeNull()
  })

  it("liefert den Kontext für ein Dokument des eigenen Projekts", async () => {
    const scope = await resolveDocumentInProject(
      lookupFor({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: PROJECT, confidentiality_level: "confidential" },
      }),
      PROJECT,
      DOC,
    )
    expect(scope).toEqual({
      documentId: DOC,
      treeNodeId: NODE,
      projectId: PROJECT,
      // Kommt aus dem KNOTEN, nicht aus dem Dokument (PROJ-Y-115c: der Knoten
      // ist die einzige Quelle der Stufe). Wäre hier eine zweite Kopie am
      // Dokument, liefe sie irgendwann auseinander.
      confidentialityLevel: "confidential",
      originalFilename: "kickoff.pdf",
      mimeType: "application/pdf",
    })
  })

  it("löst den Knoten über die Angabe AM DOKUMENT auf, nicht über Nutzereingabe", async () => {
    // Sonst könnte ein Aufrufer die Stufe eines fremden, harmloseren Knotens
    // unterschieben und damit das Vertraulichkeits-Tor umgehen.
    const lookup = lookupFor({
      documents: DOC_ROW,
      document_tree_nodes: { project_id: PROJECT, confidentiality_level: "strict" },
    })
    await resolveDocumentInProject(lookup, PROJECT, DOC)

    expect(lookup).toHaveBeenNthCalledWith(1, "documents", expect.any(String), DOC)
    expect(lookup).toHaveBeenNthCalledWith(2, "document_tree_nodes", expect.any(String), NODE)
  })

  it("gibt für alle drei Fehlschlag-Arten dasselbe zurück — kein Orakel über fremden Bestand", async () => {
    // Unsichtbar, nicht existent und fremd müssen ununterscheidbar sein: jede
    // Unterscheidung wäre eine Aussage über Bestand, den der Aufrufer nicht
    // sehen darf.
    const invisible = await resolveDocumentInProject(lookupFor({}), PROJECT, DOC)
    const nodeInvisible = await resolveDocumentInProject(
      lookupFor({ documents: DOC_ROW }),
      PROJECT,
      DOC,
    )
    const foreign = await resolveDocumentInProject(
      lookupFor({
        documents: DOC_ROW,
        document_tree_nodes: { project_id: OTHER_PROJECT, confidentiality_level: "standard" },
      }),
      PROJECT,
      DOC,
    )
    expect([invisible, nodeInvisible, foreign]).toEqual([null, null, null])
  })

  it("weist ein Dokument ohne Knoten ab, statt ohne Stufe weiterzulaufen", async () => {
    const scope = await resolveDocumentInProject(
      lookupFor({ documents: { id: DOC, tree_node_id: null } }),
      PROJECT,
      DOC,
    )
    expect(scope).toBeNull()
  })

  it("fragt den Knoten gar nicht ab, wenn das Dokument unsichtbar ist", async () => {
    const lookup = lookupFor({})
    await resolveDocumentInProject(lookup, PROJECT, DOC)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it("verträgt fehlende optionale Felder ohne zu werfen", async () => {
    const scope = await resolveDocumentInProject(
      lookupFor({
        documents: { id: DOC, tree_node_id: NODE },
        document_tree_nodes: { project_id: PROJECT },
      }),
      PROJECT,
      DOC,
    )
    expect(scope).toMatchObject({
      documentId: DOC,
      confidentialityLevel: null,
      originalFilename: null,
      mimeType: null,
    })
  })
})

/**
 * Ersatz für die statische Deckung, die dieser Helfer beim Umbau auf ein
 * Callback verloren hat: der Schema-Drift-Wächter erkennt nur String-Literale in
 * einer `.from("…").select("…")`-Kette, und hier stehen Tabelle und Spalten
 * inzwischen in Variablen. Diese Prüfung ersetzt das nicht nur, sie ist an einer
 * Stelle sogar praktischer — sie braucht kein Docker (offener Handoff
 * PROJ-67/F6) und läuft in jedem `vitest`-Durchlauf mit.
 */
describe("PROJ-80 angeforderte Spalten existieren in den Migrationen", () => {
  const dir = join(process.cwd(), "supabase/migrations")
  const corpus = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n")

  it("findet überhaupt Migrationen (sonst prüft der Test nichts)", () => {
    expect(corpus.length).toBeGreaterThan(10_000)
    expect(corpus).toContain("public.documents")
  })

  it.each([
    ...Object.entries(DOCUMENT_SCOPE_COLUMNS),
    // Auch die zwei Tabellen, die die Detailseite liest — dieselbe Blindstelle
    // des Wächters, dieselbe Ersatzprüfung.
    ...Object.entries(SUMMARY_READ_COLUMNS),
  ] as Array<[string, readonly string[]]>)(
    "%s: jede angeforderte Spalte wird von einer Migration angelegt",
    (table, columns) => {
      // Der Block, der die Tabelle anlegt, plus alle späteren Ergänzungen an ihr.
      const createIdx = corpus.indexOf(`create table if not exists public.${table} (`)
      expect(createIdx, `kein create-table für ${table}`).toBeGreaterThan(-1)
      const createBlock = corpus.slice(createIdx, corpus.indexOf("\n);", createIdx))

      const alterBlocks = corpus
        .split(/alter table (?:if exists )?public\./)
        .filter((chunk) => chunk.startsWith(`${table}\n`) || chunk.startsWith(`${table} `))
        .join("\n")

      const ddl = `${createBlock}\n${alterBlocks}`
      for (const column of columns) {
        expect(
          new RegExp(`(^|\\s|,)${column}\\s`, "m").test(ddl),
          `Spalte ${table}.${column} wird von keiner Migration angelegt`,
        ).toBe(true)
      }
    },
  )
})
