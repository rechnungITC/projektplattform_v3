"use client"

/**
 * PROJ-151-α — Zustand des projektbezogenen Chats.
 *
 * Haus-Muster: `{data, loading, error, refresh, ...mutators}`, Effekt mit
 * `let cancelled`. `unavailable` trennt „Modul aus" (404) von einem echten
 * Fehler — sonst zeigt die Fläche einen roten Kasten, wo ein neutraler Hinweis
 * hingehört (PROJ-Y-143f).
 */

import { useCallback, useEffect, useState } from "react"

import {
  ChatApiError,
  createConversation,
  listConversations,
  listFolders,
  listMessages,
  sendMessage,
  type ChatConversation,
  type ChatFolder,
  type ChatMessage,
  type SendMessageResult,
  type ChatCostSummary,
} from "@/lib/ai-chat/api"

export interface UseAiChat {
  conversations: ChatConversation[]
  folders: ChatFolder[]
  messages: ChatMessage[]
  /** PROJ-Y-151d — Kosten der offenen Unterhaltung, inkl. der Faelle ohne Zahl. */
  cost: ChatCostSummary | null
  activeId: string | null
  loading: boolean
  sending: boolean
  error: string | null
  /** Modul ist abgeschaltet — kein Fehler, sondern ein Zustand. */
  unavailable: boolean
  /** Ergebnis des letzten Sendens: trägt Grund, Skills und Aufbewahrung. */
  lastResult: SendMessageResult | null
  refresh: () => Promise<void>
  select: (id: string | null) => void
  start: (title: string) => Promise<void>
  send: (content: string) => Promise<void>
}

export function useAiChat(projectId: string): UseAiChat {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [folders, setFolders] = useState<ChatFolder[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [cost, setCost] = useState<ChatCostSummary | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [lastResult, setLastResult] = useState<SendMessageResult | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, f] = await Promise.all([
        listConversations(projectId),
        listFolders(projectId),
      ])
      setConversations(c)
      setFolders(f)
      setUnavailable(false)
    } catch (err) {
      if (err instanceof ChatApiError && err.status === 404) {
        setUnavailable(true)
      } else {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [c, f] = await Promise.all([
          listConversations(projectId),
          listFolders(projectId),
        ])
        if (cancelled) return
        setConversations(c)
        setFolders(f)
        setUnavailable(false)
      } catch (err) {
        if (cancelled) return
        if (err instanceof ChatApiError && err.status === 404) setUnavailable(true)
        else setError(err instanceof Error ? err.message : "Unbekannter Fehler")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const select = useCallback(
    (id: string | null) => {
      setActiveId(id)
      setMessages([])
      setCost(null)
      setLastResult(null)
      if (!id) return
      void (async () => {
        try {
          {
            const r = await listMessages(projectId, id)
            setMessages(r.messages)
            setCost(r.cost)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unbekannter Fehler")
        }
      })()
    },
    [projectId],
  )

  const start = useCallback(
    async (title: string) => {
      const created = await createConversation(projectId, title)
      setConversations((prev) => [created, ...prev])
      setActiveId(created.id)
      setMessages([])
      setCost(null)
      setLastResult(null)
    },
    [projectId],
  )

  const send = useCallback(
    async (content: string) => {
      if (!activeId) return
      setSending(true)
      setError(null)
      try {
        const result = await sendMessage(projectId, activeId, content)
        setLastResult(result)
        // Neu laden statt anzuhängen: bei abgeschalteter Aufbewahrung steht in
        // der Datenbank etwas anderes als hier — angehängt wäre die Anzeige
        // eine Behauptung über den gespeicherten Zustand.
        {
          const r = await listMessages(projectId, activeId)
          setMessages(r.messages)
          setCost(r.cost)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Senden fehlgeschlagen")
      } finally {
        setSending(false)
      }
    },
    [projectId, activeId],
  )

  return {
    conversations, folders, messages, cost, activeId,
    loading, sending, error, unavailable, lastResult,
    refresh, select, start, send,
  }
}
