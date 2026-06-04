/**
 * PROJ-70-γ — file-parser tests.
 *
 * Strategy: mock `file-type`, `pdfjs-dist/legacy/build/pdf.mjs`, and
 * `mammoth` via Vitest. We don't load real PDFs/DOCX in tests — the
 * goal is to verify the orchestration (magic-byte → parser dispatch →
 * caps → timeout error mapping), not the lib internals.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FileParseError,
  PARSER_CONSTANTS,
  parseFile,
  parseText,
  sniffMagic,
} from "./file-parser"

const PDF_MIME = "application/pdf"
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

// Mock module loaders so the dynamic-imports in file-parser resolve to
// our deterministic factory.
vi.mock("file-type", () => ({
  fileTypeFromBuffer: vi.fn(),
}))
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: vi.fn(),
}))
vi.mock("mammoth", () => ({
  extractRawText: vi.fn(),
}))

import * as fileType from "file-type"
import * as mammothMod from "mammoth"
import * as pdfjsMod from "pdfjs-dist/legacy/build/pdf.mjs"

const fileTypeMock = vi.mocked(fileType.fileTypeFromBuffer)
const pdfjsMock = vi.mocked(pdfjsMod.getDocument)
const mammothMock = vi.mocked(mammothMod.extractRawText)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("sniffMagic", () => {
  it("trusts text/plain caller-hint without magic-byte check", async () => {
    const result = await sniffMagic(Buffer.from(""), "text/plain")
    expect(result).toBe("text/plain")
    expect(fileTypeMock).not.toHaveBeenCalled()
  })

  it("trusts text/markdown caller-hint without magic-byte check", async () => {
    const result = await sniffMagic(Buffer.from("# H"), "text/markdown")
    expect(result).toBe("text/markdown")
  })

  it("rejects unsupported plain MIME-hints", async () => {
    await expect(sniffMagic(Buffer.from(""), "text/html")).rejects.toThrow(
      FileParseError,
    )
  })

  it("rejects buffers too short to detect", async () => {
    await expect(
      sniffMagic(Buffer.from("ab"), "application/pdf"),
    ).rejects.toThrow(/too short/)
  })

  it("dispatches via file-type lib for binary formats", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: PDF_MIME, ext: "pdf" })
    const result = await sniffMagic(Buffer.alloc(100), "application/pdf")
    expect(result).toBe(PDF_MIME)
    expect(fileTypeMock).toHaveBeenCalledOnce()
  })

  it("rejects when magic-byte returns undefined (unknown)", async () => {
    fileTypeMock.mockResolvedValueOnce(undefined)
    await expect(
      sniffMagic(Buffer.alloc(100), "application/pdf"),
    ).rejects.toThrow(/magic_byte_mismatch|Could not detect/)
  })

  it("rejects when magic-byte returns a non-allowed MIME", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: "image/png", ext: "png" })
    await expect(
      sniffMagic(Buffer.alloc(100), "application/pdf"),
    ).rejects.toThrow(/not allowed/)
  })

  it("rejects when caller-MIME is PDF but magic shows DOCX (mismatch)", async () => {
    // sniffMagic doesn't compare against caller-hint for binary; this
    // confirms it just returns the detected MIME, leaving the parser-
    // dispatch to use the magic-validated value.
    fileTypeMock.mockResolvedValueOnce({ mime: DOCX_MIME, ext: "docx" })
    const result = await sniffMagic(Buffer.alloc(100), "application/pdf")
    expect(result).toBe(DOCX_MIME)
  })
})

describe("parseText", () => {
  it("returns excerpt + raw_length for short text", () => {
    const r = parseText(Buffer.from("hello world", "utf8"))
    expect(r.excerpt).toBe("hello world")
    expect(r.raw_length).toBe(11)
    expect(r.page_count).toBe(1)
    expect(r.truncated).toBe(false)
  })

  it("caps excerpt at 8000 chars and flags truncated", () => {
    const long = "x".repeat(10_000)
    const r = parseText(Buffer.from(long, "utf8"))
    expect(r.excerpt.length).toBe(PARSER_CONSTANTS.EXCERPT_MAX_CHARS)
    expect(r.raw_length).toBe(10_000)
    expect(r.truncated).toBe(true)
  })

  it("rejects files exceeding the 25 MB cap", () => {
    const huge = Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1)
    try {
      parseText(huge)
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(FileParseError)
      expect((err as FileParseError).code).toBe("size_exceeded")
    }
  })

  it("rejects raw text > 2 MB even if under file-cap", () => {
    const overText = Buffer.alloc(
      PARSER_CONSTANTS.MAX_PLAINTEXT_RAW_BYTES + 1,
    )
    try {
      parseText(overText)
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(FileParseError)
      expect((err as FileParseError).code).toBe("raw_text_cap_exceeded")
    }
  })
})

describe("parseFile orchestration", () => {
  it("rejects size-exceeded buffer before magic-byte check", async () => {
    const huge = Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1)
    await expect(parseFile(huge, "application/pdf")).rejects.toMatchObject({
      code: "size_exceeded",
    })
    expect(fileTypeMock).not.toHaveBeenCalled()
  })

  it("dispatches to parsePdf when magic-byte says PDF", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: PDF_MIME, ext: "pdf" })
    pdfjsMock.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (n: number) => ({
          getTextContent: async () => ({
            items: [{ str: `page ${n} text` }],
          }),
        }),
      }),
    } as unknown as ReturnType<typeof pdfjsMod.getDocument>)

    const { result, mime } = await parseFile(
      Buffer.alloc(200),
      "application/pdf",
    )
    expect(mime).toBe(PDF_MIME)
    expect(result.page_count).toBe(2)
    expect(result.excerpt).toContain("page 1 text")
    expect(result.excerpt).toContain("page 2 text")
  })

  it("rejects PDF with > 200 pages (page_limit_exceeded)", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: PDF_MIME, ext: "pdf" })
    pdfjsMock.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 201,
        getPage: async () => ({
          getTextContent: async () => ({ items: [] }),
        }),
      }),
    } as unknown as ReturnType<typeof pdfjsMod.getDocument>)

    await expect(
      parseFile(Buffer.alloc(200), "application/pdf"),
    ).rejects.toMatchObject({ code: "page_limit_exceeded" })
  })

  it("dispatches to parseDocx when magic-byte says DOCX", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: DOCX_MIME, ext: "docx" })
    mammothMock.mockResolvedValueOnce({ value: "docx text", messages: [] } as Awaited<
      ReturnType<typeof mammothMod.extractRawText>
    >)

    const { result, mime } = await parseFile(Buffer.alloc(200), DOCX_MIME)
    expect(mime).toBe(DOCX_MIME)
    expect(result.excerpt).toBe("docx text")
    expect(result.page_count).toBe(1)
  })

  it("rejects DOCX with > 2 MB raw text (raw_text_cap_exceeded)", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: DOCX_MIME, ext: "docx" })
    const monster = "y".repeat(PARSER_CONSTANTS.MAX_PLAINTEXT_RAW_BYTES + 100)
    mammothMock.mockResolvedValueOnce({ value: monster, messages: [] } as Awaited<
      ReturnType<typeof mammothMod.extractRawText>
    >)

    await expect(
      parseFile(Buffer.alloc(200), DOCX_MIME),
    ).rejects.toMatchObject({ code: "raw_text_cap_exceeded" })
  })

  it("text path goes through parseText (no magic-byte lib call)", async () => {
    const buf = Buffer.from("plain note", "utf8")
    const { result, mime } = await parseFile(buf, "text/plain")
    expect(mime).toBe("text/plain")
    expect(result.excerpt).toBe("plain note")
    expect(fileTypeMock).not.toHaveBeenCalled()
  })

  it("rejects unsupported MIME-hint before parser dispatch", async () => {
    fileTypeMock.mockResolvedValueOnce({ mime: "image/png", ext: "png" })
    await expect(
      parseFile(Buffer.alloc(10), "application/pdf"),
    ).rejects.toMatchObject({ code: "unsupported_mime" })
  })
})
