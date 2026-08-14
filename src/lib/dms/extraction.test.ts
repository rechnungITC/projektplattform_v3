/**
 * PROJ-80-α.2 — Tests für die reine Extraktions-/Klassifikationslogik.
 *
 * Bewusst OHNE Parser-Mock für die Fehlerabbildung: `mapParseErrorToStatus`
 * ist über den echten `FileParseError`-Union typisiert, ein neuer Code bricht
 * hier die Kompilierung statt still in `failed` zu fallen.
 */

import { describe, expect, it } from "vitest"

import { FileParseError } from "@/lib/context-ingestion/file-parser"

import {
  SUMMARY_INPUT_MAX_CHARS,
  clampForSummary,
  mapParseErrorToStatus,
} from "./extraction"

describe("PROJ-80 mapParseErrorToStatus", () => {
  it("trennt Größe von Fehlfunktion", () => {
    // Der Unterschied ist nicht kosmetisch: "zu groß" hat mit β (Chunking) eine
    // echte Lösung, "kaputt" hat keine.
    expect(mapParseErrorToStatus("size_exceeded")).toBe("too_large")
    expect(mapParseErrorToStatus("raw_text_cap_exceeded")).toBe("too_large")
    expect(mapParseErrorToStatus("page_limit_exceeded")).toBe("too_large")

    expect(mapParseErrorToStatus("parse_failed")).toBe("failed")
    expect(mapParseErrorToStatus("parse_timeout")).toBe("failed")
    expect(mapParseErrorToStatus("msg_parse_failed")).toBe("failed")
    expect(mapParseErrorToStatus("email_too_many_parts")).toBe("failed")
  })

  it("bucht Typ-Probleme als solche, nicht als Fehler", () => {
    expect(mapParseErrorToStatus("unsupported_mime")).toBe("unsupported_type")
    expect(mapParseErrorToStatus("magic_byte_mismatch")).toBe("unsupported_type")
  })

  it("deckt jeden Code des echten Fehler-Unions ab", () => {
    // Wächter gegen stille Erweiterung: kommt ein Code dazu, ohne dass die
    // Abbildung ihn kennt, schlägt bereits `tsc` fehl (die switch-Anweisung ist
    // erschöpfend typisiert). Dieser Fall hält zusätzlich fest, dass ein
    // echter FileParseError durch die Abbildung läuft.
    const err = new FileParseError("parse_timeout", "zu lange")
    expect(mapParseErrorToStatus(err.code)).toBe("failed")
  })
})

describe("PROJ-80 clampForSummary", () => {
  it("lässt kurzen Text unangetastet und meldet keine Kürzung", () => {
    const res = clampForSummary("kurz")
    expect(res.text).toBe("kurz")
    expect(res.truncated).toBe(false)
  })

  it("kürzt langen Text und meldet es", () => {
    const res = clampForSummary("x".repeat(SUMMARY_INPUT_MAX_CHARS + 1))
    expect(res.text).toHaveLength(SUMMARY_INPUT_MAX_CHARS)
    expect(res.truncated).toBe(true)
  })

  it("meldet an der Grenze noch keine Kürzung", () => {
    const res = clampForSummary("x".repeat(SUMMARY_INPUT_MAX_CHARS))
    expect(res.truncated).toBe(false)
  })

  it("bleibt konservativ genug für lokal betriebene Modelle", () => {
    // Class-3-Inhalt darf nur an Ollama (Invariante #3), und lokale Modelle
    // laufen häufig mit 8k-Kontext. Ein großzügigerer Wert würde dort still
    // abgeschnitten — genau das, was PROJ-137 abstellen sollte. Die Zahl ist
    // hier festgenagelt, damit sie nicht beiläufig hochgesetzt wird.
    expect(SUMMARY_INPUT_MAX_CHARS).toBeLessThanOrEqual(48_000)
  })
})
