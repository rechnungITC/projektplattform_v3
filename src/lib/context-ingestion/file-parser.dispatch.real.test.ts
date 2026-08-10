/**
 * @vitest-environment node
 *
 * PROJ-Y-142b — `parseFile()` end-to-end with the REAL `file-type` sniffer and
 * the REAL parsers behind it.
 *
 * `file-parser.test.ts` mocks `file-type`, `pdfjs-dist` and `mammoth`, so it
 * proves the switch statement forwards to the right stub — but nothing about
 * whether real magic bytes actually resolve to the branch we expect. PROJ-79
 * exercised real `file-type` for the DMS path, never for this one.
 *
 * Runs in the `node` environment because these parsers only ever run
 * server-side (`/api/context-sources`), and msgreader's realm check
 * (`arrayBuffer.buffer instanceof ArrayBuffer`) fails under jsdom.
 *
 * Deliberately no `vi.mock` in this file.
 */
import { describe, expect, it } from "vitest"

import { parseFile } from "./file-parser"
import { buildDocx, buildMsg, buildPdf } from "./real-document-fixtures"

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

describe("parseFile — real magic-byte dispatch (un-mocked)", () => {
  it("routes real PDF bytes to the PDF parser", async () => {
    const { result, mime } = await parseFile(
      buildPdf("Kickoff ERP Migration 2026"),
      "application/pdf",
    )

    expect(mime).toBe("application/pdf")
    expect(result.excerpt).toContain("Kickoff ERP Migration 2026")
  })

  it("routes real DOCX bytes to the DOCX parser", async () => {
    const { result, mime } = await parseFile(
      await buildDocx(["Angebot bis Freitag prüfen."]),
      DOCX_MIME,
    )

    expect(mime).toBe(DOCX_MIME)
    expect(result.excerpt).toContain("Angebot bis Freitag prüfen.")
  })

  it("maps a real CFB container to the Outlook MSG branch", async () => {
    const { result, mime } = await parseFile(
      await buildMsg({ subject: "Kickoff", body: "Bitte prüfen." }),
      "application/vnd.ms-outlook",
    )

    // file-type reports CFB as `application/x-cfb`; sniffMagic maps it.
    expect(mime).toBe("application/vnd.ms-outlook")
    expect(result.email?.email_format).toBe("msg")
    expect(result.email?.email_subject).toBe("Kickoff")
  })

  it("trusts the caller hint for header-less .eml and runs real mailparser", async () => {
    const eml = Buffer.from(
      [
        "Message-ID: <kickoff-1@example.com>",
        "From: Alice Lead <alice@example.com>",
        "To: bob@example.com",
        "Subject: Kickoff ERP",
        "",
        "Angebot bis Freitag prüfen.",
      ].join("\r\n"),
      "utf8",
    )

    const { result, mime } = await parseFile(eml, "message/rfc822")

    expect(mime).toBe("message/rfc822")
    expect(result.email?.email_subject).toBe("Kickoff ERP")
    expect(result.excerpt).toContain("Angebot bis Freitag prüfen.")
  })

  it("lets magic bytes override a lying caller hint", async () => {
    // Real PDF bytes announced as DOCX — the sniffer must win, otherwise a
    // renamed upload would reach the wrong parser (AC-γH-5).
    const { mime } = await parseFile(buildPdf("spoofed"), DOCX_MIME)

    expect(mime).toBe("application/pdf")
  })

  it("rejects a real format that is not on the allowlist", async () => {
    // A GIF is genuinely detected by file-type (unlike a bare PNG signature
    // with no IHDR, which yields no detection at all and takes the
    // magic_byte_mismatch branch instead) — so this pins the allowlist
    // rejection rather than the undetectable-bytes rejection.
    const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(32)])

    await expect(parseFile(gif, "application/pdf")).rejects.toMatchObject({
      code: "unsupported_mime",
    })
  })

  it("rejects undetectable bytes with magic_byte_mismatch", async () => {
    await expect(
      parseFile(Buffer.from("plain bytes, no magic signature"), "application/pdf"),
    ).rejects.toMatchObject({ code: "magic_byte_mismatch" })
  })

  it("wraps a real parser failure as parse_failed", async () => {
    // Valid ZIP magic, but not an OOXML package: sniffMagic lets it through as
    // docx only if detection says so — here detection yields a non-allowlisted
    // type, so we assert the typed error surface rather than a raw library
    // throw escaping the orchestrator.
    await expect(
      parseFile(Buffer.from("PK not really a zip"), DOCX_MIME),
    ).rejects.toMatchObject({ name: "FileParseError" })
  })

  it("detects a valid .docx whose first ZIP entry exceeds the old 4100-byte sniff window", async () => {
    // PROJ-Y-142b regression: sniffMagic used to hand `file-type` only
    // buffer.subarray(0, 4100). A .docx whose first stored entry is bigger
    // than that window reports `application/zip` from the head slice and was
    // wrongly rejected as unsupported_mime, while the DMS path (full buffer,
    // PROJ-79) accepted the same file. Both paths now agree.
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()

    const media = Buffer.alloc(9_000)
    for (let i = 0; i < media.length; i++) media[i] = (i * 2654435761) & 0xff
    // Stored BEFORE [Content_Types].xml — pushes the OOXML marker out of the
    // old window.
    zip.folder("word")!.folder("media")!.file("image1.bin", media)
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    )
    zip.folder("word")!.file(
      "document.xml",
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Angebot bis Freitag prüfen.</w:t></w:r></w:p></w:body></w:document>`,
    )
    const docx = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer

    expect(docx.length).toBeGreaterThan(4_100)

    const { result, mime } = await parseFile(docx, DOCX_MIME)

    expect(mime).toBe(DOCX_MIME)
    expect(result.excerpt).toContain("Angebot bis Freitag prüfen.")
  })
})
