/**
 * @vitest-environment node
 *
 * PROJ-Y-142b-Lehre: `file-type` prueft `input instanceof Uint8Array`. Unter der
 * Standardumgebung `jsdom` liegt der globale `Uint8Array` in einem anderen Realm
 * als Nodes `Buffer`, und die Bibliothek weist ihn mit einem `TypeError` ab —
 * das sieht wie ein Produktfehler aus, ist aber die Testumgebung. Die
 * Parser-Pfade laufen ohnehin nur serverseitig.
 */
import { describe, expect, it } from "vitest"

import { isNotRagParseable, sniffDocumentMime, DmsMimeError } from "./mime"

/**
 * PROJ-45-ε (L38) — der Kennsatz „nicht parsebar" und die HEIC-Absage.
 *
 * Vorgeschichte, gemessen: `mime_unsupported_for_rag` stand für ALLE neun
 * erlaubten Formate hart auf `false`, obwohl `image/png` und `image/jpeg` seit α
 * in der Allowlist stehen und keinen Textauszug hergeben. Der Kopfkommentar der
 * Datei nannte selbst genau diesen Fall als Zweck des Feldes. Folge: jedes
 * Baufoto bekam einen dauerhaften `failed`-Auszug, und die Fläche meldete
 * „Extraktion fehlgeschlagen" für ein Bild, bei dem nichts fehlgeschlagen ist.
 *
 * Die Bestandssuite deckte den Bildfall NICHT ab (kein Test nannte das Feld) —
 * deshalb diese Datei.
 */

/** Minimales, echtes PNG (1×1, transparent) — echte Magic Bytes, kein Mock. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478" +
    "9c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
)

/** Echter JPEG-Kopf (SOI + APP0/JFIF) — genügt `file-type` für die Erkennung. */
const JPEG = Buffer.concat([
  Buffer.from("ffd8ffe000104a46494600010100000100010000", "hex"),
  Buffer.alloc(64),
  Buffer.from("ffd9", "hex"),
])

/**
 * HEIC-Container: `ftyp` mit Major-Brand `heic`. Das ist genau die Form, die
 * `file-type` erkennt — die Datei muss nicht dekodierbar sein, denn die Absage
 * fällt vor jedem Dekodierversuch.
 */
function heicHeader(): Buffer {
  const payload = Buffer.concat([
    Buffer.from("heic", "ascii"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("mif1", "ascii"),
    Buffer.from("heic", "ascii"),
  ])
  const box = Buffer.alloc(8 + payload.length)
  box.writeUInt32BE(8 + payload.length, 0)
  box.write("ftyp", 4, "ascii")
  payload.copy(box, 8)
  return Buffer.concat([box, Buffer.alloc(64)])
}

describe("isNotRagParseable (PROJ-45-ε L38)", () => {
  it("nennt Bilder als nicht parsebar", () => {
    expect(isNotRagParseable("image/png")).toBe(true)
    expect(isNotRagParseable("image/jpeg")).toBe(true)
  })

  it("lässt die textführenden Formate unberührt", () => {
    for (const mime of [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
      "text/csv",
    ]) {
      expect(isNotRagParseable(mime)).toBe(false)
    }
  })
})

describe("sniffDocumentMime — Kennsatz je Format (PROJ-45-ε L38)", () => {
  it("setzt das Flag für ein echtes PNG", async () => {
    const r = await sniffDocumentMime(PNG, "IMG_1.png")
    expect(r.mime).toBe("image/png")
    expect(r.mime_unsupported_for_rag).toBe(true)
  })

  it("setzt das Flag für ein echtes JPEG", async () => {
    const r = await sniffDocumentMime(JPEG, "IMG_2.jpg")
    expect(r.mime).toBe("image/jpeg")
    expect(r.mime_unsupported_for_rag).toBe(true)
  })

  it("setzt das Flag NICHT für ein Textformat (Gegenprobe)", async () => {
    const r = await sniffDocumentMime(Buffer.from("Hallo Baustelle"), "notiz.txt")
    expect(r.mime).toBe("text/plain")
    expect(r.mime_unsupported_for_rag).toBe(false)
  })
})

describe("sniffDocumentMime — HEIC (PROJ-45-ε Q-ε1)", () => {
  it("weist HEIC mit eigenem Code und erklärender Meldung ab", async () => {
    await expect(sniffDocumentMime(heicHeader(), "IMG_3.heic")).rejects.toThrow(
      DmsMimeError,
    )
    try {
      await sniffDocumentMime(heicHeader(), "IMG_3.heic")
      throw new Error("hätte werfen müssen")
    } catch (err) {
      const e = err as DmsMimeError
      // Eigener Code, NICHT der generische — die Oberfläche muss den Fall
      // unterscheiden können, um den iPhone-Hinweis zu zeigen.
      expect(e.code).toBe("heif_not_supported")
      expect(e.message).toContain("JPEG")
      expect(e.message).toContain("Maximale Kompatibilität")
    }
  })
})
