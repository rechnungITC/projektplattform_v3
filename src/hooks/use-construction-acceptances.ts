"use client"

import * as React from "react"

import {
  ConstructionApiError,
  fetchConstructionAcceptance,
  fetchConstructionAcceptanceSummary,
  listConstructionAcceptances,
  type AcceptanceFilters,
  type AcceptanceDetail,
} from "@/lib/construction/api"
import type {
  ConstructionAcceptance,
  ConstructionAcceptanceSummary,
} from "@/types/construction-acceptance"

/**
 * PROJ-45-γ — Lesezugriffe der Abnahme-Fläche.
 *
 * Hausmuster wie `use-construction-defects.ts`: `{data, loading, error,
 * refresh}`, `let cancelled`-Wächter, und `moduleInactive` als EIGENER Zustand —
 * ein abgeschaltetes Bau-Modul antwortet mit 404 und darf weder als Fehler noch
 * als leere Liste erscheinen (PROJ-64 AC-9 / PROJ-Y-143f).
 *
 * Die sechs Filter wirken serverseitig; in der Abhängigkeitsliste stehen darum
 * die einzelnen Werte, nicht das Filter-Objekt — sonst löste jede Neuberechnung
 * des Objekts einen Abruf aus.
 */

const NO_ACCEPTANCES: ConstructionAcceptance[] = []

export interface UseConstructionAcceptancesResult {
  acceptances: ConstructionAcceptance[]
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useConstructionAcceptances(
  projectId: string | null | undefined,
  filters: AcceptanceFilters = {}
): UseConstructionAcceptancesResult {
  const [acceptances, setAcceptances] =
    React.useState<ConstructionAcceptance[]>(NO_ACCEPTANCES)
  const [loading, setLoading] = React.useState(Boolean(projectId))
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const {
    trade_id: tradeId,
    section_id: sectionId,
    status,
    subject,
    from,
    to,
  } = filters

  React.useEffect(() => {
    if (!projectId) return

    let cancelled = false
    void (async () => {
      try {
        const rows = await listConstructionAcceptances(projectId, {
          trade_id: tradeId,
          section_id: sectionId,
          status,
          subject,
          from,
          to,
        })
        if (cancelled) return
        setAcceptances(rows)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        // 404 heisst hier „Modul aus" — die Route antwortet bewusst so, als
        // gäbe es die Fläche nicht. Das ist KEIN Fehler und KEINE leere Liste.
        if (err instanceof ConstructionApiError && err.status === 404) {
          setModuleInactive(true)
          setAcceptances(NO_ACCEPTANCES)
          setError(null)
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
  }, [projectId, tradeId, sectionId, status, subject, from, to, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { acceptances, loading, moduleInactive, error, refresh }
}

export interface UseConstructionAcceptanceSummaryResult {
  summary: ConstructionAcceptanceSummary | null
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Kopfzahlen und Abnahmestand je Gewerk. Die Auswertung ist
 * `SECURITY INVOKER` — sie beschreibt also immer genau das, was der Aufrufer
 * ohnehin sehen darf, und niemals mehr.
 */
export function useConstructionAcceptanceSummary(
  projectId: string | null | undefined
): UseConstructionAcceptanceSummaryResult {
  const [summary, setSummary] = React.useState<ConstructionAcceptanceSummary | null>(
    null
  )
  const [loading, setLoading] = React.useState(Boolean(projectId))
  const [moduleInactive, setModuleInactive] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!projectId) return

    let cancelled = false
    void (async () => {
      try {
        const data = await fetchConstructionAcceptanceSummary(projectId)
        if (cancelled) return
        setSummary(data)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ConstructionApiError && err.status === 404) {
          setModuleInactive(true)
          setSummary(null)
          setError(null)
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
  }, [projectId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  return { summary, loading, moduleInactive, error, refresh }
}

export interface UseConstructionAcceptanceDetailResult {
  detail: AcceptanceDetail | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Detail samt Teilnehmern, Vorbehalten und unveränderlichem Verlauf. Wird nur
 * geladen, wenn die Seitenblende offen ist — `acceptanceId === null` heisst
 * „nichts laden", nicht „leer".
 */
export function useConstructionAcceptanceDetail(
  projectId: string | null | undefined,
  acceptanceId: string | null
): UseConstructionAcceptanceDetailResult {
  // Der geladene Stand wird MIT seiner Kennung gehalten und nur ausgegeben,
  // wenn er zur angefragten passt. Das ersetzt ein Zurücksetzen im Effekt
  // (`set-state-in-effect` ist Hausregel-verboten) und schliesst zugleich die
  // Lücke, in der beim Wechsel der Abnahme kurz die VORIGE zu sehen wäre.
  const [entry, setEntry] = React.useState<{
    id: string
    data: AcceptanceDetail
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    if (!projectId || !acceptanceId) return

    let cancelled = false
    void (async () => {
      try {
        const data = await fetchConstructionAcceptance(projectId, acceptanceId)
        if (cancelled) return
        setEntry({ id: acceptanceId, data })
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, acceptanceId, tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const detail = entry && entry.id === acceptanceId ? entry.data : null
  // ABGELEITET, nicht gesetzt: `setLoading(true)` im Effektkörper ist
  // Hausregel-verboten (`react-hooks/set-state-in-effect`). „Lädt" heisst hier
  // genau: eine Abnahme ist angefragt, aber der gehaltene Stand gehört noch
  // nicht zu ihr. Nebeneffekt und Absicht: ein `refresh()` zeigt weiter den
  // vorhandenen Stand statt eines Skelett-Aufblitzens.
  const loading = acceptanceId !== null && detail === null && error === null

  return { detail, loading, error, refresh }
}
