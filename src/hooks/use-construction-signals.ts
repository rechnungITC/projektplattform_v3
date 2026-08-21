"use client"

import * as React from "react"

import {
  ConstructionApiError,
  fetchConstructionScheduleSignals,
} from "@/lib/construction/api"
import type { ConstructionScheduleSignals } from "@/types/construction-signals"

/**
 * PROJ-45-δ — Lesezugriff auf die Terminsignale.
 *
 * Hausmuster wie `use-construction-defects.ts`: `{data, loading, error, refresh}`,
 * `let cancelled`-Wächter, und `moduleInactive` als EIGENER Zustand — ein
 * abgeschaltetes Bau-Modul antwortet 404 (Lese-Absicht verrät die Fläche nicht,
 * AC-45δ.21) und darf weder als Fehler noch als Leerzustand erscheinen
 * (PROJ-64 AC-9 / PROJ-Y-143f).
 *
 * EIN Abruf für alle vier Blöcke, weil es serverseitig EINEN Zeitbezug gibt
 * (`as_of`, D-δ1). Vier getrennte Abrufe könnten über Mitternacht auseinander-
 * fallen und die Fläche zeigte dann Kopfzahlen, die zu ihren Listen nicht passen.
 * Deshalb gibt es hier auch keine Filterparameter: die Auswertung ist
 * ungefiltert, und die Kopfzahlen beschreiben das Projekt (AC-45δ.15).
 *
 * `signals === null` ist ein LEGITIMER Wert, kein Fehler: die Route antwortet
 * `{ signals: … | null }`, und `null` heisst „für dieses Projekt gibt es keine
 * Auswertung" (etwa kein Bauprojekt). Bewusst wird kein Ersatzobjekt erfunden —
 * `as_of` wäre dann ein ausgedachter Zeitstempel, also eine Falschaussage genau
 * auf der Fläche, die „nichts da" von „0" trennen soll.
 */
export interface UseConstructionScheduleSignalsResult {
  signals: ConstructionScheduleSignals | null
  loading: boolean
  moduleInactive: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useConstructionScheduleSignals(
  projectId: string | null | undefined
): UseConstructionScheduleSignalsResult {
  const [signals, setSignals] = React.useState<ConstructionScheduleSignals | null>(
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
        const data = await fetchConstructionScheduleSignals(projectId)
        if (cancelled) return
        setSignals(data)
        setModuleInactive(false)
        setError(null)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ConstructionApiError && err.status === 404) {
          setModuleInactive(true)
          setSignals(null)
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

  return { signals, loading, moduleInactive, error, refresh }
}
