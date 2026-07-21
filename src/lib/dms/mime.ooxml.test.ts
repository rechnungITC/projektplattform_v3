// @vitest-environment node
/**
 * PROJ-79-α QA — REAL (non-mocked) OOXML magic-byte regression.
 *
 * mime.test.ts mocks `file-type` to verify orchestration. THIS suite runs the
 * real `file-type` lib against genuine docx/xlsx/pptx buffers built with
 * `jszip`, to prove the /backend review-fix: `sniffDocumentMime` passes the
 * FULL buffer to `file-type` so ZIP-based OOXML subtypes are detected — a 4 KB
 * head slice returns `application/zip` for a docx whose markers sit past byte
 * 4100 and would wrongly 415 a valid Word document.
 *
 * QA vector: "MIME-Spoof-415 (echtes docx/xlsx/pptx hochladen, wg.
 * OOXML-Full-Buffer-Fix)".
 */

import { randomBytes } from "crypto"

import JSZip from "jszip"
import { fileTypeFromBuffer } from "file-type"
import { describe, expect, it } from "vitest"

import { sniffDocumentMime } from "./mime"

const OOXML = {
  docx: {
    part: "/word/document.xml",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    file: "word/document.xml",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    part: "/xl/workbook.xml",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    file: "xl/workbook.xml",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pptx: {
    part: "/ppt/presentation.xml",
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    file: "ppt/presentation.xml",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
} as const

async function buildOoxml(
  kind: keyof typeof OOXML,
  opts: { padBytes?: number } = {},
): Promise<Buffer> {
  const spec = OOXML[kind]
  const zip = new JSZip()
  // Optional incompressible (STORE) pad as the FIRST entry pushes the OOXML
  // markers past the given byte offset — reproduces the 4 KB-slice failure.
  if (opts.padBytes) {
    zip.file("aaa_pad.bin", randomBytes(opts.padBytes), { compression: "STORE" })
  }
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="${spec.part}" ContentType="${spec.type}"/></Types>`,
  )
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="${spec.part.slice(1)}"/></Relationships>`,
  )
  zip.file(spec.file, `<?xml version="1.0"?><root>hello</root>`)
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }))
}

describe("sniffDocumentMime — real OOXML (docx/xlsx/pptx)", () => {
  it.each(["docx", "xlsx", "pptx"] as const)(
    "detects a real %s and marks it RAG-supported",
    async (kind) => {
      const buf = await buildOoxml(kind)
      const res = await sniffDocumentMime(buf, `sample.${kind}`)
      expect(res.mime).toBe(OOXML[kind].mime)
      expect(res.mime_unsupported_for_rag).toBe(false)
    },
  )

  it("detects a docx whose OOXML markers sit past byte 4100 (full-buffer fix)", async () => {
    const buf = await buildOoxml("docx", { padBytes: 6000 })
    expect(buf.length).toBeGreaterThan(4100)

    // Guard: the OLD behaviour (4 KB head slice) would return application/zip
    // → NOT in the allowlist → a valid docx would be wrongly rejected 415.
    const sliced = await fileTypeFromBuffer(buf.subarray(0, 4100))
    expect(sliced?.mime).toBe("application/zip")

    // The FIX: sniffDocumentMime passes the whole buffer → correct docx mime.
    const res = await sniffDocumentMime(buf, "big.docx")
    expect(res.mime).toBe(OOXML.docx.mime)
  })

  it("rejects a spoofed .pdf that is really a docx (415 anti-spoof)", async () => {
    const buf = await buildOoxml("docx")
    await expect(sniffDocumentMime(buf, "spoof.pdf")).rejects.toMatchObject({
      code: "magic_byte_mismatch",
    })
  })

  it("rejects a real PNG-less unknown binary as unsupported", async () => {
    // A plain ZIP (no OOXML override) sniffs as application/zip → not allowed.
    const zip = new JSZip()
    zip.file("readme.txt", "not an office doc")
    const buf = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }))
    await expect(sniffDocumentMime(buf, "archive.bin")).rejects.toMatchObject({
      code: "unsupported_mime",
    })
  })
})
