/**
 * PROJ-45-ε (L35, AC-45εH-7) — abgeleitete Größen für Galerie und Ausdruck.
 *
 * `sharp` ist bereits Produktions-Abhängigkeit (Next.js-Optimierer); dieser Teil
 * kommt also ohne neues Paket. HEIC ist NICHT dabei — die Messung in `/backend`
 * hat gezeigt, dass das ausgelieferte libvips den Container liest, aber nicht
 * dekodiert (`heif: Decoder plugin generated an error`), und sharps eigene
 * Typdefinition verlangt dafür ein global installiertes libvips mit libde265.
 * HEIC wird deshalb schon im Sniffer abgewiesen (siehe `dms/mime.ts`).
 *
 * **Die Grenze ist hier und nicht im Aufrufer**, weil sie zum Bild gehört, nicht
 * zur Route: eine kleine Datei kann eine riesige Pixelmasse tragen
 * („Dekompressionsbombe"), und die Prüfung muss VOR dem Entpacken greifen.
 * `sharp().metadata()` liest nur den Kopf und entpackt dafür nichts.
 *
 * Gemessen (Rauschen, also ungünstigster Fall, 4032×3024 → 9 MB Original):
 * Vorschau 480 px ≈ 14 KB in 66 ms, Druckgröße 1400 px ≈ 457 KB in 101 ms,
 * beide parallel 144 ms bei +32 MB RSS. Absolut also rund 0,5 MB je Foto.
 */

import sharp from "sharp"

/**
 * Obergrenze der Pixelmasse. 60 Megapixel lässt jede reale Kamera durch (ein
 * iPhone mit 48 MP liefert 8064×6048 ≈ 48,8 MP) und weist die klassischen
 * Bomben ab. Bewusst NICHT sharps Standard (≈268 MP): 268 MP × 3 Byte wären
 * über 800 MB Rohdaten in einer Funktion mit Speichergrenze.
 */
export const MAX_IMAGE_PIXELS = 60_000_000

/** Breite der Galerie-Vorschau. */
export const PREVIEW_WIDTH = 480
/** Breite der Druckgröße — reicht für eine halbe A4-Seite bei 150 dpi. */
export const PRINT_WIDTH = 1400

export type PhotoVariant = "preview" | "print"

export class PhotoImageError extends Error {
  readonly code: "too_many_pixels" | "unreadable" | "resize_failed"
  constructor(code: PhotoImageError["code"], message: string) {
    super(message)
    this.name = "PhotoImageError"
    this.code = code
  }
}

export interface PhotoProbe {
  width: number
  height: number
  /** Rohblock für {@link readCaptureDate}; `null`, wenn das Bild keinen trägt. */
  exif: Buffer | null
}

/**
 * Liest Maße und EXIF-Rohblock und prüft die Pixelgrenze — ohne die Pixel zu
 * entpacken. Wirft mit sprechendem Code, damit die Route den Status wählen kann.
 */
export async function probePhoto(buffer: Buffer): Promise<PhotoProbe> {
  let meta
  try {
    meta = await sharp(buffer).metadata()
  } catch (err) {
    throw new PhotoImageError(
      "unreadable",
      `Bild konnte nicht gelesen werden: ${(err as Error).message}`,
    )
  }
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  if (width <= 0 || height <= 0) {
    throw new PhotoImageError("unreadable", "Bild ohne verwertbare Maße.")
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new PhotoImageError(
      "too_many_pixels",
      `Bild hat ${width}×${height} Pixel und überschreitet die Grenze von ` +
        `${MAX_IMAGE_PIXELS} Pixeln.`,
    )
  }
  return { width, height, exif: meta.exif ?? null }
}

/**
 * Erzeugt eine abgeleitete Größe. `rotate()` ohne Argument wendet die
 * EXIF-Ausrichtung an — ohne das liegen Hochkant-Aufnahmen vom Telefon quer.
 *
 * `withoutEnlargement` verhindert, dass ein kleines Bild künstlich vergrößert
 * wird: eine 200-px-Aufnahme soll 200 px bleiben und nicht als unscharfe
 * 1400-px-Datei doppelt Platz belegen.
 */
export async function renderVariant(
  buffer: Buffer,
  variant: PhotoVariant,
): Promise<Buffer> {
  const width = variant === "preview" ? PREVIEW_WIDTH : PRINT_WIDTH
  const quality = variant === "preview" ? 72 : 80
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
  } catch (err) {
    throw new PhotoImageError(
      "resize_failed",
      `Abgeleitete Größe "${variant}" konnte nicht erzeugt werden: ${(err as Error).message}`,
    )
  }
}

/**
 * Ablageweg einer abgeleiteten Größe.
 *
 * Sie liegen als GESCHWISTER neben dem Original im Ordner des Dokumentknotens
 * und sind bewusst KEINE eigenen `documents`-Zeilen (Q-ε6): die Quota-Buchhaltung
 * addiert je Dokumentzeile, drei Zeilen hiessen dreifache Zählung und dreifache
 * Anzeige im Dokumentenbaum.
 *
 * Der Unterordner `_derived` ist unschädlich für die Zugriffsregel: die
 * Bucket-Policy löst den Knoten über die Pfadsegmente 1–3 auf
 * (Mandant/Projekt/Knoten) und ignoriert tiefere Segmente — live an
 * `_dms_object_access` gemessen, nicht angenommen.
 */
export function derivedObjectPath(
  originalPath: string,
  variant: PhotoVariant,
): string {
  const slash = originalPath.lastIndexOf("/")
  const dir = originalPath.slice(0, slash)
  const leaf = originalPath.slice(slash + 1)
  const stem = leaf.replace(/\.[^.]+$/, "")
  return `${dir}/_derived/${variant}-${stem}.jpg`
}
