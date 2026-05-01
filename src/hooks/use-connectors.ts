"use client"

import * as React from "react"

import {
  type ConnectorListEntry,
  deleteConnectorCredentials,
  listConnectors,
  saveConnectorCredentials,
  testConnector,
} from "@/lib/connectors/api"
import type { ConnectorHealth, ConnectorKey } from "@/lib/connectors/types"

interface UseConnectorsResult {
  connectors: ConnectorListEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  save: (key: ConnectorKey, payload: unknown) => Promise<void>
  remove: (key: ConnectorKey) => Promise<void>
  test: (key: ConnectorKey) => Promise<ConnectorHealth>
}

export function useConnectors(): UseConnectorsResult {
  const [connectors, setConnectors] = React.useState<ConnectorListEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listConnectors()
        if (cancelled) return
        setConnectors(list)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick])

  const refresh = React.useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const save = React.useCallback(
    async (key: ConnectorKey, payload: unknown) => {
      await saveConnectorCredentials(key, payload)
      await refresh()
    },
    [refresh]
  )

  const remove = React.useCallback(
    async (key: ConnectorKey) => {
      await deleteConnectorCredentials(key)
      await refresh()
    },
    [refresh]
  )

  const test = React.useCallback(async (key: ConnectorKey) => {
    const result = await testConnector(key)
    return result.health
  }, [])

  return { connectors, loading, error, refresh, save, remove, test }
}
