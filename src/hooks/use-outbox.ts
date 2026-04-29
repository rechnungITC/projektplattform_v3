"use client"

import * as React from "react"

import {
  createOutboxDraft,
  deleteOutboxDraft,
  type DispatchSummary,
  listOutbox,
  type OutboxDraftInput,
  type OutboxListOptions,
  sendOutbox,
  updateOutboxDraft,
} from "@/lib/communication/api"
import type {
  Channel,
  CommunicationOutboxEntry,
  OutboxStatus,
} from "@/types/communication"

interface UseOutboxFilters {
  channel?: Channel
  status?: OutboxStatus
}

interface UseOutboxResult {
  entries: CommunicationOutboxEntry[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createDraft: (input: OutboxDraftInput) => Promise<CommunicationOutboxEntry>
  updateDraft: (
    id: string,
    input: Partial<OutboxDraftInput>
  ) => Promise<CommunicationOutboxEntry>
  deleteDraft: (id: string) => Promise<void>
  send: (
    id: string
  ) => Promise<{
    outbox: CommunicationOutboxEntry
    dispatch: DispatchSummary
  }>
}

export function useOutbox(
  projectId: string,
  filters: UseOutboxFilters = {}
): UseOutboxResult {
  const [entries, setEntries] = React.useState<CommunicationOutboxEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const opts: OutboxListOptions = {}
      if (filters.channel) opts.channel = filters.channel
      if (filters.status) opts.status = filters.status
      const list = await listOutbox(projectId, opts)
      setEntries(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId, filters.channel, filters.status])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const createDraft = React.useCallback(
    async (input: OutboxDraftInput) => {
      const created = await createOutboxDraft(projectId, input)
      await refresh()
      return created
    },
    [projectId, refresh]
  )

  const updateDraft = React.useCallback(
    async (id: string, input: Partial<OutboxDraftInput>) => {
      const updated = await updateOutboxDraft(projectId, id, input)
      await refresh()
      return updated
    },
    [projectId, refresh]
  )

  const deleteDraft = React.useCallback(
    async (id: string) => {
      await deleteOutboxDraft(projectId, id)
      await refresh()
    },
    [projectId, refresh]
  )

  const send = React.useCallback(
    async (id: string) => {
      const result = await sendOutbox(projectId, id)
      await refresh()
      return result
    },
    [projectId, refresh]
  )

  return {
    entries,
    loading,
    error,
    refresh,
    createDraft,
    updateDraft,
    deleteDraft,
    send,
  }
}
