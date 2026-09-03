/**
 * PROJ-158-α — Client-Wrapper der Postfach-Routen.
 *
 * Nutzt `ApiRequestError` (PROJ-Y-143f), damit die Fläche eine Absage am
 * **Code** unterscheiden kann statt am Meldungstext — hier konkret nötig, weil
 * `provider_not_available_yet` (β kommt noch) etwas anderes ist als ein
 * Eingabefehler, und `duplicate_mailbox` etwas anderes als ein Serverfehler.
 */

import { ApiRequestError, apiRequestError } from "@/lib/api-error"

import type { MailboxProvider, MailboxSecurity } from "./validation"

/**
 * Wie die API ein Postfach zurückgibt. Das Geheimnis fehlt hier — und zwar
 * nicht aus Versehen: es verlässt die Anwendung nie, auch nicht verschlüsselt
 * (AC-158.2). Der Typ bildet damit ab, was es wirklich gibt.
 */
export interface Mailbox {
  id: string
  label: string
  provider: MailboxProvider
  imap_host: string | null
  imap_port: number | null
  imap_security: MailboxSecurity | null
  imap_username: string | null
  status: MailboxStatus
  last_checked_at: string | null
  last_error_code: string | null
  created_at: string
  updated_at: string
}

export type MailboxStatus =
  | "unchecked"
  | "connected"
  | "auth_failed"
  | "unreachable"
  | "mailbox_disabled"
  | "consent_required"
  | "error"

export interface CreateMailboxPayload {
  label: string
  provider: MailboxProvider
  imap_host: string
  imap_port: number
  imap_security: MailboxSecurity
  imap_username: string
  password: string
}

export interface MailboxTestResult {
  result: string
  folder_count: number | null
  mailbox: Mailbox | null
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) throw await apiRequestError(response)
  return (await response.json()) as T
}

export async function listMailboxes(): Promise<Mailbox[]> {
  const res = await fetch("/api/mailboxes")
  const body = await unwrap<{ mailboxes: Mailbox[] }>(res)
  return body.mailboxes
}

export async function createMailbox(
  payload: CreateMailboxPayload
): Promise<Mailbox> {
  const res = await fetch("/api/mailboxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const body = await unwrap<{ mailbox: Mailbox }>(res)
  return body.mailbox
}

export async function deleteMailbox(id: string): Promise<void> {
  const res = await fetch(`/api/mailboxes/${id}`, { method: "DELETE" })
  if (!res.ok) throw await apiRequestError(res)
}

export async function testMailbox(id: string): Promise<MailboxTestResult> {
  const res = await fetch(`/api/mailboxes/${id}/test`, { method: "POST" })
  return unwrap<MailboxTestResult>(res)
}

export { ApiRequestError }
