"use client"

import * as React from "react"

import {
  ConstructionApiError,
  fetchConstructionDefectSummary,
  listConstructionDefects,
  listConstructionDefectEvents,
  type ListDefectFilters,
} from "@/lib/construction/api"
import type {
  ConstructionDefect,
  ConstructionDefectEvent,
  ConstructionDefectSummary,
} from "@/types/construction-defect"

/**
 * PROJ-45-β — Lesezugriffe der Mängel-Fläche.
 *
 * Hausmuster wie `use-construction.ts`: `{data, loading, error, refresh}`,
 * `let cancelled`-Wächter, und `moduleInactive` als eigener Zustand — ein
 * abgeschaltetes Bau-Modul antwortet mit 404 und darf weder als Fehler noch als
 * leere Liste erscheinen (PROJ-64 AC-9 / PROJ-Y-143f).
 *
 * Die Filter werden serverseitig angewandt (die Route kennt fünf), damit die
 * Fläche auch bei 200+ Einträgen bedienbar bleibt (Edge Case „Viele Mängel").
 * In der Abhängigkeitsliste stehen deshalb die einzelnen Werte, nicht das
 * Filter-Objekt — sonst löste jede Neuberechnung des Objekts einen Abruf aus.
 */

const NO_DEFECTS: ConstructionDefect[] = []
const NO_EVENTS: ConstructionDefectEvent[] = []

export interface UseConstructionDefectsResult {
  defects: ConstructionDefect[]
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useConstructionDefects(
  projectId: string | null | undefined,
  filters: ListDefectFilters = {}
): UseConstructionDefectsResult {
  const [defects, setDefects] = React.useState<ConstructionDefect[]>(NO_DEFECTS)
  const [loading, setLoading] = React.useState(Boolean(projectId))
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const { trade_id: tradeId, section_id: sectionId, status, severity, overdue } = filters

  React.useEffect(() => {
    if (!projectId) return

    let cancelled = false
    void (async () => {
      try {
        const rows = await listConstructionDefects(projectId, {
          trade_id: tradeId,
          section_id: sectionId,
          status,
          severity,
          overdue,
        })
        if (cancelled) return
        setDefects(rows)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ConstructionApiError && err.status === 404) {
          setModuleInactive(true)
          setDefects(NO_DEFECTS)
        } else {
          setError(err instanceof Error ? err.message : "Unbekannter Fehler")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, tradeId, sectionId, status, severity, overdue, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { defects, loading, moduleInactive, error, refresh }
}

export interface UseConstructionDefectSummaryResult {
  summary: ConstructionDefectSummary | null
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Zähler des Projekts. Die Auswertung ist `SECURITY INVOKER`, also unter der RLS
 * des Aufrufers gerechnet — ein Mitglied, das einen Mangel nicht sehen darf,
 * kann ihn auch aus den Summen nicht erschliessen (AC-45βH-1).
 *
 * Bewusst UNGEFILTERT: die Kopfzahlen beschreiben das Projekt, nicht die gerade
 * gewählte Filterkombination (Muster PROJ-122).
 */
export function useConstructionDefectSummary(
  projectId: string | null | undefined,
  enabled = true
): UseConstructionDefectSummaryResult {
  const [summary, setSummary] = React.useState<ConstructionDefectSummary | null>(null)
  const [loading, setLoading] = React.useState(Boolean(projectId) && enabled)
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!projectId || !enabled) return

    let cancelled = false
    void (async () => {
      try {
        const data = await fetchConstructionDefectSummary(projectId)
        if (cancelled) return
        setSummary(data)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ConstructionApiError && err.status === 404) {
          setModuleInactive(true)
          setSummary(null)
        } else {
          setError(err instanceof Error ? err.message : "Unbekannter Fehler")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, enabled, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { summary, loading, moduleInactive, error, refresh }
}

export interface UseConstructionDefectEventsResult {
  events: ConstructionDefectEvent[]
  loading: boolean
  error: string | null
}

/**
 * Der Verlauf eines Mangels (AC-45β.12). Wird erst geladen, wenn eine
 * Detailansicht offen ist — `defectId = null` lädt nichts.
 */
export function useConstructionDefectEvents(
  projectId: string | null | undefined,
  defectId: string | null | undefined,
  /** Erhöhen, um nach einem Statuswechsel neu zu laden. */
  reloadKey = 0
): UseConstructionDefectEventsResult {
  // Der Ladezustand ist ABGELEITET, nicht gesetzt: `setLoading(true)` im Effekt
  // ist im Haus verboten (`react-hooks/set-state-in-effect`), und ein
  // Umschalter, der nur nach dem `await` schreibt, würde beim Wechsel auf einen
  // anderen Mangel kurz den Verlauf des vorherigen zeigen. Solange der
  // abgelegte Schlüssel nicht zum angefragten passt, wird geladen.
  const key = `${projectId ?? ""}:${defectId ?? ""}:${reloadKey}`
  const [loaded, setLoaded] = React.useState<{
    key: string
    events: ConstructionDefectEvent[]
    error: string | null
  }>({ key: "", events: NO_EVENTS, error: null })

  React.useEffect(() => {
    if (!projectId || !defectId) return

    let cancelled = false
    void (async () => {
      try {
        const rows = await listConstructionDefectEvents(projectId, defectId)
        if (cancelled) return
        setLoaded({ key, events: rows, error: null })
      } catch (err) {
        if (cancelled) return
        setLoaded({
          key,
          events: NO_EVENTS,
          error: err instanceof Error ? err.message : "Unbekannter Fehler",
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, defectId, key])

  const fresh = loaded.key === key
  return {
    events: fresh ? loaded.events : NO_EVENTS,
    loading: Boolean(projectId && defectId) && !fresh,
    error: fresh ? loaded.error : null,
  }
}
