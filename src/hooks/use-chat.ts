"use client"

import * as React from "react"

import { listChat, postChat } from "@/lib/communication/api"
import { createClient } from "@/lib/supabase/client"
import type { ChatMessage } from "@/types/communication"

interface UseChatResult {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  send: (body: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * PROJ-13 — chat hook.
 *
 * Loads the recent chat history once, then subscribes to Supabase
 * Realtime INSERTs on `project_chat_messages` filtered by project. New
 * messages append to local state without a re-fetch. RLS still applies
 * — Postgres won't broadcast rows the user can't read.
 */
export function useChat(projectId: string): UseChatResult {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listChat(projectId)
      setMessages(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chat:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_chat_messages",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev
            return [...prev, incoming]
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [projectId])

  const send = React.useCallback(
    async (body: string) => {
      const trimmed = body.trim()
      if (!trimmed) return
      const created = await postChat(projectId, trimmed)
      // The realtime event will usually arrive before/after — dedupe by id.
      setMessages((prev) => {
        if (prev.some((m) => m.id === created.id)) return prev
        return [...prev, created]
      })
    },
    [projectId]
  )

  return { messages, loading, error, send, refresh }
}
