"use client"

import * as React from "react"

import type { AssistantWorkItemDraftRef } from "@/lib/assistant/types"

/**
 * PROJ-144 — die offenen Sprach-Entwürfe des Aufrufers für die Liste im
 * Assistant-Overlay (Lock L7).
 *
 * Entwürfe sind nutzer-privat. Die Sichtbarkeitsregel liegt in der RLS der
 * Tabelle und im `user_id`-Filter der Route (AC-144.18); dieser Hook hält
 * bewusst keine eigene Regel — er zeigt nur, was die Route herausgibt.
 */
export interface AssistantWorkItemDraftRow extends AssistantWorkItemDraftRef {
  created_at: string
}

/** Das nach der Bestätigung entstandene Work-Item (AC-144.20). */
export interface ConfirmedWorkItem {
  id: string
  project_id: string
  kind: string
  title: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

/**
 * Serverantworten in eine Aussage übersetzen, die im Overlay etwas nützt.
 *
 * Die Routen antworten bewusst auf Englisch (Entwicklersicht, Logs); die
 * Oberfläche ist deutsch. Deshalb wird über den stabilen `code` gemappt und
 * nicht die rohe Meldung durchgereicht — ein durchgereichtes
 * „Kind 'story' is not visible in method 'waterfall'." hilft niemandem im
 * Meeting.
 */
export function messageForDraftError(
  code: string | undefined,
  status: number,
): string {
  switch (code) {
    case "draft_not_open":
      return "Dieser Entwurf wurde bereits verwendet oder wird gerade angelegt."
    case "forbidden":
      return "Dir fehlt das Schreibrecht in diesem Projekt."
    case "module_disabled":
      return "Der Assistant ist in diesem Mandanten deaktiviert."
    case "not_found":
      return "Der Entwurf existiert nicht mehr."
    case "method_violation":
      return "Diese Art passt nicht zur Methode des Projekts."
    case "invalid_parent":
    case "invalid_parent_kind":
      return "Dieses Element braucht ein übergeordnetes Element — bitte im Backlog anlegen."
    case "validation_error":
      return "Der Titel ist leer oder zu lang."
    case "unauthorized":
      return "Deine Sitzung ist abgelaufen. Bitte neu anmelden."
    default:
      return `Anlage fehlgeschlagen (HTTP ${status}).`
  }
}

async function readError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null
  return new Error(messageForDraftError(body?.error?.code, response.status))
}

/**
 * `enabled` steuert das Laden: die Liste wird erst geholt, wenn das Overlay
 * offen ist — ein geschlossenes Overlay soll keine Anfragen erzeugen.
 */
export function useAssistantWorkItemDrafts(enabled: boolean) {
  const [data, setData] = React.useState<AssistantWorkItemDraftRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  const refresh = React.useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  React.useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/assistant/work-item-drafts")
        if (!response.ok) throw await readError(response)
        const body = (await response.json()) as {
          drafts: AssistantWorkItemDraftRow[]
        }
        if (cancelled) return
        setData(body.drafts ?? [])
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "Entwürfe nicht ladbar",
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [enabled, reloadToken])

  /**
   * Schritt 2 des Zwei-Schritt-Flusses: aus dem Entwurf wird ein echtes
   * Work-Item. Titel und Beschreibung werden mitgeschickt, damit eine
   * Korrektur in der Prüfansicht auch wirklich ankommt — ohne das wäre die
   * Bestätigung eine Formsache.
   */
  const confirm = React.useCallback(
    async (
      draftId: string,
      patch: { title: string; description: string | null },
    ): Promise<ConfirmedWorkItem> => {
      const response = await fetch(
        `/api/assistant/work-item-drafts/${draftId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      )
      if (!response.ok) throw await readError(response)
      const body = (await response.json()) as {
        work_item: ConfirmedWorkItem
      }
      setData((prev) => prev.filter((row) => row.id !== draftId))
      return body.work_item
    },
    [],
  )

  const discard = React.useCallback(async (draftId: string): Promise<void> => {
    const response = await fetch(
      `/api/assistant/work-item-drafts/${draftId}`,
      { method: "DELETE" },
    )
    if (!response.ok) throw await readError(response)
    setData((prev) => prev.filter((row) => row.id !== draftId))
  }, [])

  return { data, loading, error, refresh, confirm, discard }
}
