/**
 * @vitest-environment node
 *
 * PROJ-Y-142b — `parseMsg()` against the REAL `@kenjiuno/msgreader`.
 *
 * The `node` environment is required, not cosmetic: msgreader's DataStream
 * gate is `arrayBuffer.buffer instanceof ArrayBuffer` (DataStream.js:42), and
 * under the repo-default jsdom environment the global `ArrayBuffer` belongs to
 * a different realm than a Node `Buffer`'s, so every real parse would throw
 * "Unknown arrayBuffer". That is a test-harness artifact, not a product bug —
 * this parser only ever runs server-side in the Node runtime
 * (`/api/context-sources`) — so the suite runs where production runs.
 *
 * `msg-parser.test.ts` mocks the library, on the stated grounds that
 * "constructing real CFB binaries in tests is impractical". That premise no
 * longer holds: msgreader ships its own CFB writer at `lib/Burner`, so we can
 * burn genuine Compound-File bytes and read them back through the real
 * reader — no new dependency and no checked-in binary fixture. See
 * `real-document-fixtures.ts` for the builder and its stated limitation
 * (writer and reader come from the same package, so this does not prove
 * Outlook-file compatibility — it proves the real CFB parse path runs and our
 * field mapping resolves).
 *
 * Deliberately no `vi.mock` in this file.
 */
import { describe, expect, it } from "vitest"

import { PARSER_CONSTANTS } from "./file-parser"
import { parseMsg } from "./msg-parser"
import { buildMsg } from "./real-document-fixtures"

describe("parseMsg — real @kenjiuno/msgreader (un-mocked)", () => {
  it("maps subject, body and sender from real CFB bytes", async () => {
    const msg = await buildMsg({
      subject: "Kickoff ERP Migration 2026",
      body: "Bitte Angebot bis Freitag prüfen.",
      senderName: "Alice Lead",
      senderEmail: "alice@example.com",
    })

    // Sanity: these really are Compound-File bytes, not a stub.
    expect(msg.subarray(0, 8).toString("hex")).toBe("d0cf11e0a1b11ae1")

    const result = await parseMsg(msg)

    expect(result.excerpt).toContain("Bitte Angebot bis Freitag prüfen.")
    expect(result.email?.email_format).toBe("msg")
    expect(result.email?.email_subject).toBe("Kickoff ERP Migration 2026")
    expect(result.email?.email_from).toEqual({
      name: "Alice Lead",
      address: "alice@example.com",
    })
  })

  it("falls back to stripped HTML when there is no plain body (AC-δH-5)", async () => {
    const result = await parseMsg(
      await buildMsg({
        subject: "Nur HTML",
        bodyHtml: "<html><body><p>Angebot <b>liegt</b> vor.</p></body></html>",
      }),
    )

    expect(result.excerpt).toContain("Angebot")
    expect(result.excerpt).toContain("liegt")
    expect(result.excerpt).not.toContain("<b>")
  })

  it("maps a real msgreader failure to msg_parse_failed (AC-δH-4)", async () => {
    // Not CFB at all — exercises the real library's failure signature rather
    // than a mocked throw, which is precisely what a dependency bump could
    // change underneath us.
    await expect(parseMsg(Buffer.from("this is not a compound file"))).rejects.toMatchObject(
      { code: "msg_parse_failed" },
    )
  })

  it("rejects an oversized buffer before invoking msgreader", async () => {
    const oversized = Buffer.alloc(PARSER_CONSTANTS.MAX_FILE_BYTES + 1)

    await expect(parseMsg(oversized)).rejects.toMatchObject({
      code: "size_exceeded",
    })
  })
})
