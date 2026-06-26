/**
 * PROJ-113 — fetch wrappers for the DD Q&A process: questions under a DD stream
 * (create / edit / answer / status-transition / delete / CSV export). Consumed
 * by the /frontend slice (Q&A tab in the DD stream detail).
 */

import type { MaConfidentialityLevel } from "@/types/confidentiality"

export type DdQuestionStatus =
  | "open"
  | "in_answering"
  | "answered"
  | "followup"
  | "closed"

export type DdQuestionPriority = "low" | "medium" | "high"

export interface DdQuestion {
  id: string
  tenant_id: string
  project_id: string
  dd_stream_id: string
  title: string
  detail: string | null
  addressee: string | null
  priority: DdQuestionPriority
  due_date: string | null
  responsible_user_id: string | null
  status: DdQuestionStatus
  answer_text: string | null
  answer_link: string | null
  answered_at: string | null
  answered_by: string | null
  answer_round: number
  confidentiality_level: MaConfidentialityLevel
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/dd-questions`
}

export interface ListDdQuestionsFilter {
  streamId?: string
  status?: DdQuestionStatus
  ownerId?: string
}

export async function listDdQuestions(
  projectId: string,
  filter: ListDdQuestionsFilter = {}
): Promise<DdQuestion[]> {
  const params = new URLSearchParams()
  if (filter.streamId) params.set("streamId", filter.streamId)
  if (filter.status) params.set("status", filter.status)
  if (filter.ownerId) params.set("ownerId", filter.ownerId)
  const qs = params.toString()
  const res = await fetch(`${p(projectId)}${qs ? `?${qs}` : ""}`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { questions: DdQuestion[] }).questions
}

export interface CreateDdQuestionPayload {
  dd_stream_id: string
  title: string
  detail?: string | null
  addressee?: string | null
  priority?: DdQuestionPriority
  due_date?: string | null
  responsible_user_id?: string | null
  confidentiality_level?: MaConfidentialityLevel
}

export async function createDdQuestion(
  projectId: string,
  payload: CreateDdQuestionPayload
): Promise<DdQuestion> {
  const res = await fetch(p(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { question: DdQuestion }).question
}

export interface UpdateDdQuestionPayload {
  title?: string
  detail?: string | null
  addressee?: string | null
  priority?: DdQuestionPriority
  due_date?: string | null
  responsible_user_id?: string | null
  confidentiality_level?: MaConfidentialityLevel
  answer_text?: string | null
  answer_link?: string | null
}

export async function updateDdQuestion(
  projectId: string,
  questionId: string,
  payload: UpdateDdQuestionPayload
): Promise<DdQuestion> {
  const res = await fetch(`${p(projectId)}/${encodeURIComponent(questionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { question: DdQuestion }).question
}

export async function transitionDdQuestionStatus(
  projectId: string,
  questionId: string,
  toStatus: DdQuestionStatus,
  comment?: string | null
): Promise<DdQuestion> {
  const res = await fetch(
    `${p(projectId)}/${encodeURIComponent(questionId)}/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status: toStatus, comment: comment ?? null }),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { question: DdQuestion }).question
}

export async function deleteDdQuestion(
  projectId: string,
  questionId: string
): Promise<void> {
  const res = await fetch(`${p(projectId)}/${encodeURIComponent(questionId)}`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(await safeError(res))
}

/** Builds the CSV export URL (RLS-scoped server-side); open/download client-side. */
export function ddQuestionsExportUrl(
  projectId: string,
  filter: ListDdQuestionsFilter = {}
): string {
  const params = new URLSearchParams()
  if (filter.streamId) params.set("streamId", filter.streamId)
  if (filter.status) params.set("status", filter.status)
  if (filter.ownerId) params.set("ownerId", filter.ownerId)
  const qs = params.toString()
  return `${p(projectId)}/export${qs ? `?${qs}` : ""}`
}
