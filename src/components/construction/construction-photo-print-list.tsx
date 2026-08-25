"use client"

import * as React from "react"
import Image from "next/image"

import { constructionPhotoFileUrl } from "@/lib/construction/photos-api"
import type { ConstructionPhoto } from "@/types/construction-photo"

interface Props {
  projectId: string
  photos: ConstructionPhoto[]
}

/**
 * PROJ-45-ε (L33, AC-45ε.11–.14) — Fotos im Ausdruck.
 *
 * Eingebettet wird die **Druckgrösse**, nicht das Original (AC-45ε.13): ein
 * Protokoll mit acht 9-MB-Bildern wäre ein unbrauchbar grosses PDF, und 1400 px
 * reichen für eine halbe A4-Seite bei 150 dpi.
 *
 * **Ein Bild, das nicht geladen werden konnte, wird benannt** statt als leerer
 * Kasten gedruckt. Das ist die tragende Hälfte von AC-45εH-14: ein Nachweis, der
 * lautlos ausfällt, ist schlimmer als einer, der fehlt und das sagt — genau die
 * Klasse, die PROJ-Y-45l beseitigt hat. Dafür braucht es `onError`, also ein
 * Client-Eiland in einer sonst serverseitigen Druckseite.
 *
 * Sichtbarkeit entscheidet die Druckseite, nicht diese Komponente: sie liest
 * über den Sitzungs-Client des Aufrufers (AC-45ε.14) und übergibt nur, was
 * ohnehin sichtbar ist. Die Bytes holt der Browser über die gleich-origin
 * Ausliefer-Route, die dieselbe Zugriffsregel führt.
 */
export function ConstructionPhotoPrintList({ projectId, photos }: Props) {
  const [failed, setFailed] = React.useState<Record<string, true>>({})

  // Kein leerer Abschnitt bei null Fotos (AC-45ε.11/.12): die Seite bleibt
  // gegenüber heute unverändert.
  if (photos.length === 0) return null

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Fotos ({photos.length})
      </p>
      <ul className="grid grid-cols-2 gap-3">
        {photos.map((photo) => {
          const caption = photo.caption?.trim() || null
          const taken = photo.taken_on
            ? new Date(photo.taken_on).toLocaleDateString("de-DE")
            : null
          return (
            <li key={photo.id} className="break-inside-avoid">
              {failed[photo.id] ? (
                <p className="rounded border border-dashed p-3 text-xs">
                  Foto konnte nicht geladen werden:{" "}
                  {photo.original_filename ?? photo.id}
                </p>
              ) : (
                <Image
                  src={constructionPhotoFileUrl(projectId, photo.id, "print")}
                  alt={caption ?? photo.original_filename ?? "Baufoto"}
                  width={700}
                  height={525}
                  unoptimized
                  className="h-auto w-full rounded border"
                  onError={() =>
                    setFailed((cur) => ({ ...cur, [photo.id]: true }))
                  }
                />
              )}
              <p className="mt-1 text-xs">
                {caption ?? "Ohne Bildunterschrift"}
                {taken ? ` · aufgenommen am ${taken}` : " · Aufnahmedatum unbekannt"}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
