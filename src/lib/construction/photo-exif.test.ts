/**
 * @vitest-environment node
 *
 * PROJ-45-ε (L36). Die Bilder werden mit `sharp` ERZEUGT und mit `sharp`
 * zurückgelesen — also gegen echte EXIF-Bytes geprüft, nicht gegen einen Mock.
 * (PROJ-142-Lehre: eine gemockte Bibliothek überlebt einen Major-Sprung
 * unbemerkt.) Node-Umgebung, weil `sharp` serverseitig läuft.
 */
import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { readCaptureDate } from "./photo-exif"

async function jpegWith(exif: Record<string, Record<string, string>> | null) {
  let img = sharp({ create: { width: 8, height: 8, channels: 3, background: "#889" } })
  if (exif) img = img.withExif(exif)
  return img.jpeg().toBuffer()
}

async function exifOf(buf: Buffer) {
  const meta = await sharp(buf).metadata()
  return meta.exif ?? null
}

describe("readCaptureDate (PROJ-45-ε L36)", () => {
  it("liest DateTimeOriginal als Tagesdatum", async () => {
    const buf = await jpegWith({ IFD2: { DateTimeOriginal: "2026:08:19 14:33:07" } })
    expect(readCaptureDate(await exifOf(buf))).toBe("2026-08-19")
  })

  it("gibt null für ein Bild OHNE EXIF zurück — und erfindet kein Datum", async () => {
    expect(readCaptureDate(await exifOf(await jpegWith(null)))).toBeNull()
  })

  it("gibt null zurück, wenn EXIF da ist, aber ohne Aufnahmezeit", async () => {
    const buf = await jpegWith({ IFD0: { Make: "Apple", Model: "iPhone" } })
    expect(readCaptureDate(await exifOf(buf))).toBeNull()
  })

  it("übernimmt GPS und Geräteangaben NICHT — es gibt gar keinen Rückgabeweg dafür", async () => {
    // Der tragende Nachweis für L36 ist die Signatur: die Funktion gibt einen
    // String oder null zurück. Selbst ein Bild MIT Standortdaten kann also
    // nichts davon weitergeben. Zusätzlich geprüft: der Tag kommt trotzdem an.
    const buf = await jpegWith({
      IFD0: { Make: "Apple", Model: "iPhone 15" },
      IFD2: { DateTimeOriginal: "2026:07:01 08:15:00" },
      IFD3: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" },
    })
    const out = readCaptureDate(await exifOf(buf))
    expect(out).toBe("2026-07-01")
    expect(typeof out).toBe("string")
  })

  it("weist einen unplausiblen Wert ab (0000:00:00)", async () => {
    const buf = await jpegWith({ IFD2: { DateTimeOriginal: "0000:00:00 00:00:00" } })
    expect(readCaptureDate(await exifOf(buf))).toBeNull()
  })

  it("verträgt Müll ohne zu werfen", () => {
    expect(readCaptureDate(null)).toBeNull()
    expect(readCaptureDate(Buffer.alloc(0))).toBeNull()
    expect(readCaptureDate(Buffer.from("nicht mal ein TIFF-Kopf"))).toBeNull()
    expect(readCaptureDate(Buffer.from("4949", "hex"))).toBeNull()
    // Bytefolge-Marke stimmt, Magie nicht — muss abgelehnt werden.
    expect(readCaptureDate(Buffer.concat([Buffer.from("II", "ascii"), Buffer.alloc(30)]))).toBeNull()
  })
})
