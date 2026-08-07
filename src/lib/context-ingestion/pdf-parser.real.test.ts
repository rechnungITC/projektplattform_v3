/**
 * PROJ-142 — parsePdf() against the REAL `pdfjs-dist`, not a mock.
 *
 * Why this file exists: `file-parser.test.ts` mocks
 * `pdfjs-dist/legacy/build/pdf.mjs` wholesale, so its 26 green tests pass
 * identically whether the installed pdfjs works, is broken, or is absent.
 * That gap was exposed by the pdfjs-dist 5.6.205 -> 6.2.108 bump
 * (GHSA-hq66-cqwq-w95j, arbitrary JS execution on a malicious PDF): the
 * mocked suite stayed green across a major-version jump that changed the
 * declared engine range. Same class of gap PROJ-79 closed for `file-type`
 * with `mime.ooxml.test.ts`.
 *
 * This test drives the exact API surface `parsePdf` depends on —
 * getDocument({data, disableWorker}) -> .promise -> numPages -> getPage(n)
 * -> getTextContent() -> items[].str — through a real, generated PDF, so a
 * future pdfjs upgrade that breaks text extraction fails here instead of in
 * production kickoff ingestion.
 *
 * NOTE: deliberately no `vi.mock` in this file.
 */
import { describe, expect, it } from "vitest"

import { parsePdf } from "./file-parser"

/**
 * Build a minimal, structurally valid single-page PDF with one text-showing
 * (`Tj`) operator. Hand-rolled rather than checked in as a binary fixture so
 * the expected text lives next to the assertion.
 */
function buildPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]

  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const [i, body] of objs.entries()) {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  }

  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  return Buffer.from(pdf, "latin1")
}

describe("parsePdf — real pdfjs-dist (un-mocked)", () => {
  it("extracts text from a real PDF", async () => {
    const result = await parsePdf(buildPdf("Kickoff ERP Migration 2026"))

    expect(result.excerpt).toContain("Kickoff ERP Migration 2026")
    // PROJ-75 — full_text must carry the complete extraction, since it is the
    // privacy-classification input.
    expect(result.full_text).toContain("Kickoff ERP Migration 2026")
    expect(result.page_count).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it("rejects a buffer over the size cap before touching pdfjs", async () => {
    // 26 MB > MAX_FILE_BYTES (25 MB) — must throw the typed parse error
    // rather than handing an oversized buffer to the parser.
    const oversized = Buffer.alloc(26 * 1024 * 1024)

    await expect(parsePdf(oversized)).rejects.toMatchObject({
      code: "size_exceeded",
    })
  })
})
