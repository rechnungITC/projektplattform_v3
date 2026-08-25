/**
 * PROJ-45-ε `/qa` — echte Bilddateien für den authentifizierten Durchlauf.
 *
 * Erzeugt statt mitgeliefert: eine eingecheckte Binärdatei wäre nicht
 * nachvollziehbar (welche EXIF-Felder trägt sie?), und `sharp` ist ohnehin
 * Produktions-Abhängigkeit. Genau die Lehre aus PROJ-Y-142b, wo aus demselben
 * Grund DOCX und CFB zur Laufzeit gebaut werden.
 *
 * **Der EXIF-Inhalt ist der Zweck.** AC-45ε.8 verlangt, dass ausschliesslich die
 * Aufnahmezeit übernommen wird; ein Bild ohne Geräteangaben und ohne GPS könnte
 * das nicht belegen. Gemessen an dem, was `sharp@0.35` wirklich schreibt:
 * `IFD0.Make`/`Model` und `IFD3.GPSLatitudeRef` landen im Block, der numerische
 * GPS-Wert in dieser Schreibform nicht — die Marke genügt, weil der Nachweis
 * lautet „nichts davon erreicht die Datenbank", nicht „der Wert war X".
 */

import sharp from "sharp"

export const FIXTURE_CAPTURE_DATE = "2026-03-14"
const EXIF_CAPTURE = "2026:03:14 09:41:07"
export const FIXTURE_DEVICE_MAKE = "E2E-Kamera"
export const FIXTURE_DEVICE_MODEL = "PROJ-45-eps"

export interface PhotoFixture {
  name: string
  mimeType: string
  buffer: Buffer
}

/** JPEG mit Aufnahmezeit, Geräteangaben und einer GPS-Marke. */
export async function jpegWithExif(
  name = "baufoto-mit-exif.jpg",
  size = { width: 900, height: 675 },
): Promise<PhotoFixture> {
  const buffer = await sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 3,
      background: { r: 32, g: 96, b: 168 },
    },
  })
    .withExif({
      IFD0: { Make: FIXTURE_DEVICE_MAKE, Model: FIXTURE_DEVICE_MODEL },
      IFD2: { DateTimeOriginal: EXIF_CAPTURE },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 31/1 12/1" },
    })
    .jpeg({ quality: 82 })
    .toBuffer()
  return { name, mimeType: "image/jpeg", buffer }
}

/** JPEG ohne jedes EXIF — für „es wird kein Datum erfunden" (AC-45ε.7). */
export async function jpegWithoutExif(
  name = "baufoto-ohne-exif.jpg",
): Promise<PhotoFixture> {
  const buffer = await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 180, g: 70, b: 40 },
    },
  })
    .jpeg({ quality: 78 })
    .toBuffer()
  return { name, mimeType: "image/jpeg", buffer }
}

/** Echtes PNG — der zweite erlaubte Typ. */
export async function pngPhoto(name = "baufoto.png"): Promise<PhotoFixture> {
  const buffer = await sharp({
    create: {
      width: 500,
      height: 400,
      channels: 3,
      background: { r: 12, g: 140, b: 90 },
    },
  })
    .png()
    .toBuffer()
  return { name, mimeType: "image/png", buffer }
}

/**
 * Text, der sich als `.jpg` ausgibt — der Magic-Byte-Fall (AC-45εH-8). Der
 * gemeldete Inhaltstyp ist bewusst `image/jpeg`: geprüft werden muss, dass die
 * **Bytes** entscheiden und nicht die Angabe des Aufrufers.
 */
export function fakeJpeg(name = "gar-kein-bild.jpg"): PhotoFixture {
  return {
    name,
    mimeType: "image/jpeg",
    buffer: Buffer.from("Dies ist eine Textdatei und kein Bild.\n", "utf8"),
  }
}

/** Echtes PDF-Präfix — im DMS erlaubter Typ, aber kein Bild. */
export function pdfNotAPhoto(name = "kein-foto.pdf"): PhotoFixture {
  return {
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n", "utf8"),
  }
}

/** Wie das Original-EXIF aussieht — für die Gegenprobe im Test selbst. */
export async function describeExif(buffer: Buffer): Promise<string> {
  const meta = await sharp(buffer).metadata()
  return (meta.exif ?? Buffer.alloc(0)).toString("latin1")
}

/**
 * Trägt das Bild einen GPS-Block?
 *
 * Auf den **Bytes** geprüft, nicht auf einer Zeichenkette: EXIF speichert
 * numerische Tag-Kennungen, keine Namen — eine Suche nach „GPSLatitudeRef" im
 * Textabzug schlägt immer fehl, auch wenn GPS-Daten vorhanden sind. Erste
 * Fassung dieses Tests fiel genau darauf herein.
 *
 * Gesucht wird `0x8825` (GPS-IFD-Zeiger) in der Bytefolge, die der TIFF-Kopf
 * ansagt (`II` = kleinendig, `MM` = grossendig). Der Kopf beginnt hinter dem
 * `Exif\0\0`-Präfix, das sharp mitliefert (in `/backend` gemessen).
 */
export async function hasGpsBlock(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata()
  const exif = meta.exif
  if (!exif || exif.length < 10) return false
  const prefix = Buffer.from("457869660000", "hex")
  const base = exif.subarray(0, 6).equals(prefix) ? 6 : 0
  const little = exif.subarray(base, base + 2).toString("latin1") === "II"
  const tag = Buffer.alloc(2)
  if (little) tag.writeUInt16LE(0x8825, 0)
  else tag.writeUInt16BE(0x8825, 0)
  return exif.subarray(base).includes(tag)
}
