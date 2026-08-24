/**
 * PROJ-45-ε (L36) — Aufnahmezeit aus den EXIF-Daten, und NUR die.
 *
 * Warum von Hand und ohne Paket: gebraucht wird **ein** Feld
 * (`DateTimeOriginal`). Ein EXIF-Paket brächte einen ganzen Metadaten-Baum mit,
 * einschliesslich GPS und Geräteangaben — also genau das, was L36 ausdrücklich
 * NICHT in die Datenbank lassen will. Ein Leser, der nur ein Feld kennt, kann
 * auch nur ein Feld ausleiten. Dieselbe Linie wie die dep-freie
 * Zeilenvergleichs-Hilfe in PROJ-77 statt einer Diff-Bibliothek.
 *
 * Eingabe ist der Rohblock, den `sharp().metadata().exif` liefert. GEMESSEN:
 * er beginnt MIT dem `Exif\0\0`-Präfix des JPEG-Segments, der TIFF-Kopf steht
 * also ab Byte 6 (`45786966 0000` vor `II*`). Eine erste Fassung dieses Lesers
 * begann bei 0, las „Ex" als Bytefolge-Marke und gab still `null` zurück —
 * deshalb wird das Präfix erkannt und übersprungen, statt eine Lage
 * anzunehmen.
 *
 * Rückgabe ist ein Datum als `YYYY-MM-DD` oder `null`. **Nie** ein Ersatzwert:
 * ein Foto ohne EXIF darf kein Datum erfinden (AC-45ε.7).
 */

/** IFD-Zeiger auf den Exif-Unterblock (Tag 0x8769). */
const TAG_EXIF_IFD = 0x8769
/** DateTimeOriginal (Tag 0x9003) — der Zeitpunkt der Aufnahme. */
const TAG_DATE_TIME_ORIGINAL = 0x9003
/** ASCII-Typ. */
const TYPE_ASCII = 2
/** Notausstieg gegen präparierte Blöcke: mehr Einträge hat kein reales Bild. */
const MAX_ENTRIES_PER_IFD = 512

/** `Exif\0\0` — das Präfix des JPEG-APP1-Segments, das sharp mitliefert. */
const EXIF_PREFIX = Buffer.from("457869660000", "hex")

/** ASCII-Ausschnitt mit Grenzpruefung; `null` statt Ausnahme. */
function readAscii(buf: Buffer, absOffset: number, len: number): string | null {
  if (absOffset < 0 || absOffset + len > buf.length) return null
  return buf.toString("ascii", absOffset, absOffset + len)
}

/** Anfang des TIFF-Kopfs im Block (0 oder hinter `Exif\0\0`). */
function baseOf(buf: Buffer): number {
  return buf.subarray(0, EXIF_PREFIX.length).equals(EXIF_PREFIX) ? EXIF_PREFIX.length : 0
}

interface Reader {
  /** Liest 16 Bit RELATIV zum TIFF-Kopf. */
  u16: (off: number) => number
  /** Liest 32 Bit RELATIV zum TIFF-Kopf. */
  u32: (off: number) => number
}

function readerFor(buf: Buffer): Reader | null {
  // Präfix erkennen statt annehmen: manche Quellen liefern den TIFF-Kopf blank,
  // sharp liefert ihn mit Präfix. EINE Autorität dafür: `baseOf`.
  const base = baseOf(buf)
  if (buf.length < base + 8) return null
  const marker = buf.toString("ascii", base, base + 2)
  const little = marker === "II"
  const big = marker === "MM"
  if (!little && !big) return null
  // Alle Offsets in EXIF sind relativ zum TIFF-Kopf — der Leser rechnet die
  // Basis hinzu, damit der Rest der Datei mit den Rohwerten arbeiten kann.
  const u16 = (off: number) =>
    little ? buf.readUInt16LE(base + off) : buf.readUInt16BE(base + off)
  const u32 = (off: number) =>
    little ? buf.readUInt32LE(base + off) : buf.readUInt32BE(base + off)
  // Magie 42 — bestätigt, dass die Bytefolge-Marke nicht zufällig passte.
  try {
    if (u16(2) !== 42) return null
  } catch {
    return null
  }
  return { u16, u32 }
}

/**
 * Sucht in einem IFD nach einem Tag und gibt dessen Rohwert-Zeiger zurück.
 * Liefert `null`, wenn das Tag fehlt oder der Block unplausibel ist.
 */
function findTag(
  buf: Buffer,
  r: Reader,
  ifdOffset: number,
  tag: number,
): { type: number; count: number; valueOffset: number } | null {
  if (ifdOffset < 8) return null
  let count: number
  try {
    count = r.u16(ifdOffset)
  } catch {
    return null
  }
  if (count > MAX_ENTRIES_PER_IFD) return null
  for (let i = 0; i < count; i += 1) {
    const entry = ifdOffset + 2 + i * 12
    try {
      if (r.u16(entry) !== tag) continue
    } catch {
      return null
    }
    const type = r.u16(entry + 2)
    const n = r.u32(entry + 4)
    // Werte bis 4 Byte stehen im Eintrag selbst, längere hinter einem Zeiger.
    const inline = n * (type === TYPE_ASCII ? 1 : 4) <= 4
    return { type, count: n, valueOffset: inline ? entry + 8 : r.u32(entry + 8) }
  }
  return null
}

/**
 * Liest `DateTimeOriginal` und gibt es als `YYYY-MM-DD` zurück.
 *
 * EXIF schreibt den Wert als `YYYY:MM:DD HH:MM:SS` **ohne Zeitzone**. Genau
 * deshalb wird nur der Tag übernommen: aus einer zonenlosen Angabe eine
 * Zeitmarke zu bauen hiesse, eine Zone zu erfinden.
 */
export function readCaptureDate(exif: Buffer | null | undefined): string | null {
  if (!exif || exif.length < 8) return null
  const r = readerFor(exif)
  if (!r) return null

  const ifd0 = r.u32(4)
  const exifPointer = findTag(exif, r, ifd0, TAG_EXIF_IFD)
  if (!exifPointer) return null
  const found = findTag(exif, r, r.u32(exifPointer.valueOffset), TAG_DATE_TIME_ORIGINAL)
  if (!found || found.type !== TYPE_ASCII) return null

  // Der Wert steht 19 ASCII-Zeichen lang im Block; die Lage ist relativ zum
  // TIFF-Kopf, also über denselben Leser aufgelöst.
  const raw = readAscii(exif, found.valueOffset + baseOf(exif), 19)
  if (raw === null) return null
  const m = /^(\d{4}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}$/.exec(raw)
  if (!m) return null
  const [, y, mo, d] = m
  // Plausibilität: EXIF-Kameras schreiben gelegentlich `0000:00:00`.
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  return `${y}-${mo}-${d}`
}
