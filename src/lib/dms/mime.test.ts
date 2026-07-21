import { beforeEach, describe, expect, it, vi } from "vitest"

const { fileTypeFromBufferMock } = vi.hoisted(() => ({
  fileTypeFromBufferMock: vi.fn(),
}))

vi.mock("file-type", () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}))

import { DmsMimeError, sniffDocumentMime } from "./mime"

beforeEach(() => {
  fileTypeFromBufferMock.mockReset()
})

describe("sniffDocumentMime", () => {
  it("trusts extension for text formats (no magic bytes)", async () => {
    const res = await sniffDocumentMime(Buffer.from("hello"), "notes.txt")
    expect(res).toEqual({ mime: "text/plain", mime_unsupported_for_rag: false })
    expect(fileTypeFromBufferMock).not.toHaveBeenCalled()
  })
  it("maps .md and .csv text extensions", async () => {
    expect((await sniffDocumentMime(Buffer.from("x"), "readme.md")).mime).toBe("text/markdown")
    expect((await sniffDocumentMime(Buffer.from("x"), "data.csv")).mime).toBe("text/csv")
  })
  it("accepts a sniffed pdf", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ ext: "pdf", mime: "application/pdf" })
    const res = await sniffDocumentMime(Buffer.from("%PDF-1.4"), "file.pdf")
    expect(res.mime).toBe("application/pdf")
  })
  it("accepts a sniffed png", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ ext: "png", mime: "image/png" })
    expect((await sniffDocumentMime(Buffer.from("x"), "img.png")).mime).toBe("image/png")
  })
  it("rejects unsniffable binary (magic_byte_mismatch)", async () => {
    fileTypeFromBufferMock.mockResolvedValue(undefined)
    await expect(sniffDocumentMime(Buffer.from("x"), "file.pdf")).rejects.toMatchObject({
      code: "magic_byte_mismatch",
    })
  })
  it("rejects a disallowed sniffed type (unsupported_mime)", async () => {
    fileTypeFromBufferMock.mockResolvedValue({ ext: "exe", mime: "application/x-msdownload" })
    await expect(sniffDocumentMime(Buffer.from("MZ"), "evil.exe")).rejects.toMatchObject({
      code: "unsupported_mime",
    })
  })
  it("rejects a spoofed extension vs sniffed type (magic_byte_mismatch)", async () => {
    // Declared .pdf but the bytes are really a png.
    fileTypeFromBufferMock.mockResolvedValue({ ext: "png", mime: "image/png" })
    const err = await sniffDocumentMime(Buffer.from("PNG"), "spoof.pdf").catch((e) => e)
    expect(err).toBeInstanceOf(DmsMimeError)
    expect(err.code).toBe("magic_byte_mismatch")
  })
})
