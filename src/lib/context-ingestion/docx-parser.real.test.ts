/**
 * PROJ-Y-142b — `parseDocx()` against the REAL `mammoth`, not a mock.
 *
 * `file-parser.test.ts` replaces `mammoth` with `vi.mock`, so its DOCX cases
 * assert only that our wrapper forwards whatever the stub returns. They would
 * stay green if mammoth were broken, absent, or silently changed its output
 * shape — the same gap that let the pdfjs 5 → 6 major bump pass unnoticed
 * (PROJ-142) and that PROJ-79 closed for `file-type`.
 *
 * Deliberately no `vi.mock` in this file.
 */
import { describe, expect, it } from "vitest"

import { PARSER_CONSTANTS, parseDocx } from "./file-parser"
import { buildDocx } from "./real-document-fixtures"

describe("parseDocx — real mammoth (un-mocked)", () => {
  it("extracts paragraph text from a real .docx", async () => {
    const result = await parseDocx(
      await buildDocx(["Kickoff ERP Migration 2026", "Angebot bis Freitag prüfen."]),
    )

    expect(result.excerpt).toContain("Kickoff ERP Migration 2026")
    expect(result.excerpt).toContain("Angebot bis Freitag prüfen.")
    // PROJ-75 — full_text is the privacy-classification input and must carry
    // the complete extraction, not just the excerpt window.
    expect(result.full_text).toContain("Angebot bis Freitag prüfen.")
    expect(result.truncated).toBe(false)
    expect(result.page_count).toBe(1)
  })

  it("caps the excerpt at EXCERPT_MAX_CHARS while full_text stays complete", async () => {
    const { EXCERPT_MAX_CHARS } = PARSER_CONSTANTS
    // ~12k chars of real document text — comfortably past the excerpt cut but
    // far below the 2 MB raw-text cap, so this exercises the excerpt window
    // rather than the fail-closed reject.
    const paragraph = "Meilenstein und Budgetfreigabe. ".repeat(12)
    const docx = await buildDocx(Array.from({ length: 32 }, () => paragraph))

    const result = await parseDocx(docx)

    expect(result.excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS)
    expect(result.full_text.length).toBeGreaterThan(EXCERPT_MAX_CHARS)
    expect(result.raw_length).toBe(result.full_text.length)
  })

  it("rejects an oversized buffer before invoking mammoth", async () => {
    const oversized = Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1)

    await expect(parseDocx(oversized)).rejects.toMatchObject({
      code: "size_exceeded",
    })
  })

  it("lets a real mammoth failure propagate for a non-DOCX buffer", async () => {
    // parseDocx deliberately does NOT wrap library errors — `parseFile` is the
    // layer that maps them to FileParseError('parse_failed'), which
    // `file-parser.dispatch.real.test.ts` covers end-to-end. Pinned here so a
    // future refactor that swallows the error inside parseDocx is visible.
    await expect(parseDocx(Buffer.from("not a docx at all"))).rejects.toThrow()
  })
})
