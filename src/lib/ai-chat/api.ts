/**
 * PROJ-151-α — Client-Wrapper für den projektbezogenen KI-Chat.
 *
 * Fehler tragen ihren HTTP-Status mit: 404 „Modul aus" muss von einem echten
 * Fehlschlag unterscheidbar bleiben, sonst zeigt die Fläche einen roten Kasten,
 * wo ein neutraler Hinweis hingehört (PROJ-Y-143f).
 */

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = "ChatApiError"
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null
    throw new ChatApiError(
      body?.message ?? body?.error ?? `HTTP ${res.status}`,
      res.status,
      body?.error,
    )
  }
  return (await res.json()) as T
}

export interface ChatConversation {
  id: string
  title: string
  folder_id: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  token_input: number | null
  token_output: number | null
  created_at: string
}

export interface ChatFolder {
  id: string
  name: string
  created_at: string
}

export interface ChatPromptTemplate {
  id: string
  title: string
  body: string
  is_active: boolean
  is_favorite: boolean
}

export interface ChatModelPrice {
  id: string
  provider: string
  model: string
  input_per_1m: number
  output_per_1m: number
  currency: string
}

export interface SendMessageResult {
  message: ChatMessage
  status: "success" | "error" | "external_blocked"
  reason_code: string | null
  provider: string
  skills_applied: string[]
  context_truncated: boolean
  history_retention: "store" | "redacted" | "none"
  answer_text: string
}

export const listConversations = (projectId: string) =>
  call<{ conversations: ChatConversation[] }>(
    `/api/projects/${projectId}/chat/conversations`,
  ).then((r) => r.conversations)

export const createConversation = (
  projectId: string,
  title: string,
  folderId?: string | null,
) =>
  call<{ conversation: ChatConversation }>(
    `/api/projects/${projectId}/chat/conversations`,
    { method: "POST", body: JSON.stringify({ title, folder_id: folderId ?? null }) },
  ).then((r) => r.conversation)

export const listMessages = (projectId: string, conversationId: string) =>
  call<{ messages: ChatMessage[] }>(
    `/api/projects/${projectId}/chat/conversations/${conversationId}/messages`,
  ).then((r) => r.messages)

export const sendMessage = (
  projectId: string,
  conversationId: string,
  content: string,
) =>
  call<SendMessageResult>(
    `/api/projects/${projectId}/chat/conversations/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify({ content }) },
  )

export const listFolders = (projectId: string) =>
  call<{ folders: ChatFolder[] }>(`/api/projects/${projectId}/chat/folders`).then(
    (r) => r.folders,
  )

export const createFolder = (projectId: string, name: string) =>
  call<{ folder: ChatFolder }>(`/api/projects/${projectId}/chat/folders`, {
    method: "POST",
    body: JSON.stringify({ name }),
  }).then((r) => r.folder)

/** Vorprüfung vor dem Senden. Hält nichts auf — sie sagt nur, was gleich passiert (L3). */
export const checkInput = (projectId: string, content: string) =>
  call<{ looks_personal: boolean; blocks_sending: boolean }>(
    `/api/projects/${projectId}/chat/check-input`,
    { method: "POST", body: JSON.stringify({ content }) },
  )

export const listPromptTemplates = () =>
  call<{ templates: ChatPromptTemplate[] }>("/api/chat/prompt-templates").then(
    (r) => r.templates,
  )

export const setFavorite = (templateId: string, on: boolean) =>
  call<{ is_favorite: boolean }>(`/api/chat/prompt-templates/${templateId}`, {
    method: on ? "PUT" : "DELETE",
  })

export const listModelPrices = () =>
  call<{ prices: ChatModelPrice[] }>("/api/chat/model-prices").then((r) => r.prices)
