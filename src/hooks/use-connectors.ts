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

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listConnectors()
      setConnectors(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

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
