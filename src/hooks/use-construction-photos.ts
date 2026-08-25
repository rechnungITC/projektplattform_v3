"use client"

import * as React from "react"

import {
  ConstructionPhotoApiError,
  fetchConstructionPhotoCounts,
  listConstructionPhotos,
  type PhotoAnchor,
} from "@/lib/construction/photos-api"
import type {
  ConstructionPhoto,
  ConstructionPhotoCounts,
} from "@/types/construction-photo"

/**
 * PROJ-45-ε — Lesezugriffe der Fotoflächen.
 *
 * Hausmuster (`{data, loading, error, refresh}`, `let cancelled`-Wächter) und
 * `moduleInactive` als EIGENER Zustand: ein abgeschaltetes Bau-Modul antwortet
 * mit 404 und darf weder als Fehler noch als leere Strecke erscheinen
 * (PROJ-64 AC-9 / PROJ-Y-143f — „never imply green/safe").
 */

const NO_PHOTOS: ConstructionPhoto[] = []

export interface UseConstructionPhotosResult {
  photos: ConstructionPhoto[]
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useConstructionPhotos(
  projectId: string | null | undefined,
  anchor: PhotoAnchor,
): UseConstructionPhotosResult {
  const [photos, setPhotos] = React.useState<ConstructionPhoto[]>(NO_PHOTOS)
  const [loading, setLoading] = React.useState(
    Boolean(projectId) &&
      Boolean(anchor.defect_id || anchor.acceptance_id || anchor.section_id),
  )
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  // Einzelwerte in der Abhängigkeitsliste, nicht das Anker-Objekt — sonst löst
  // jede Neuberechnung des Objekts einen Abruf aus.
  const { defect_id: defectId, acceptance_id: acceptanceId, section_id: sectionId } =
    anchor
  const hasAnchor = Boolean(defectId || acceptanceId || sectionId)

  // Bare early return, kein Zurücksetzen im Effect: `setState` synchron im
  // Effect-Rumpf ist im Haus verboten (`react-hooks/set-state-in-effect`), und
  // ein Wechsel des Ankers wird über einen `key` am Aufrufer erledigt — dieselbe
  // Antwort wie in γ beim Protokoll-Formular (PROJ-70-β-Lehre).
  React.useEffect(() => {
    if (!projectId || !hasAnchor) return

    let cancelled = false
    void (async () => {
      try {
        const rows = await listConstructionPhotos(projectId, {
          defect_id: defectId,
          acceptance_id: acceptanceId,
          section_id: sectionId,
        })
        if (cancelled) return
        setPhotos(rows)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ConstructionPhotoApiError && err.status === 404) {
          setModuleInactive(true)
          setPhotos(NO_PHOTOS)
          setError(null)
        } else {
          setError(err instanceof Error ? err.message : "Fotos konnten nicht geladen werden.")
          setPhotos(NO_PHOTOS)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, defectId, acceptanceId, sectionId, hasAnchor, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { photos, loading, moduleInactive, error, refresh }
}

export interface UseConstructionPhotoCountsResult {
  counts: ConstructionPhotoCounts | null
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Zähler je Anker (AC-45ε.15). Eine Abfrage für die ganze Fläche — die
 * α-Abschnittsliste soll erkennen lassen, **ob** Fotos vorhanden sind, ohne
 * dafür je Abschnitt eine Strecke zu laden.
 */
export function useConstructionPhotoCounts(
  projectId: string | null | undefined,
): UseConstructionPhotoCountsResult {
  const [counts, setCounts] = React.useState<ConstructionPhotoCounts | null>(null)
  const [loading, setLoading] = React.useState(Boolean(projectId))
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!projectId) return

    let cancelled = false
    void (async () => {
      try {
        const data = await fetchConstructionPhotoCounts(projectId)
        if (cancelled) return
        setCounts(data)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ConstructionPhotoApiError && err.status === 404) {
          setModuleInactive(true)
        } else {
          setError(err instanceof Error ? err.message : "Zähler nicht verfügbar.")
        }
        setCounts(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { counts, loading, moduleInactive, error, refresh }
}
