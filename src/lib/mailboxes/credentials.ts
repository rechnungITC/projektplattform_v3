/**
 * PROJ-158-α — verschluesselte Ablage des Postfach-Geheimnisses.
 *
 * Wiederverwendet werden die **Ver- und Entschluesselungsfunktionen** der
 * Konnektoren (PROJ-14), nicht deren Tabelle: `tenant_secrets` haelt je
 * Mandant und Konnektor-Art genau einen Eintrag, ein Nutzer kann aber mehrere
 * Postfaecher haben (korrigiertes AC-158.4, Tech Design Abschnitt 1).
 *
 * Es entsteht damit **kein zweites Verschluesselungsverfahren** — nur ein
 * zweiter Ablageort fuer den Chiffretext.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export class EncryptionUnavailableError extends Error {
  constructor() {
    super("encryption_unavailable: SECRETS_ENCRYPTION_KEY is not set.")
    this.name = "EncryptionUnavailableError"
  }
}

export function isEncryptionAvailable(): boolean {
  return Boolean(process.env.SECRETS_ENCRYPTION_KEY)
}

function key(): string {
  const k = process.env.SECRETS_ENCRYPTION_KEY
  if (!k) throw new EncryptionUnavailableError()
  return k
}

export interface MailboxCredential {
  /** α: Passwort. β ergaenzt hier Token-Felder, ohne die Ablage umzubauen. */
  password: string
}

/** Verschluesselt das Geheimnis. Der Aufrufer legt den Chiffretext ab. */
export async function encryptMailboxCredential(
  supabase: SupabaseClient,
  payload: MailboxCredential
): Promise<string> {
  if (!isEncryptionAvailable()) throw new EncryptionUnavailableError()
  const { data, error } = await supabase.rpc("encrypt_tenant_secret_with_key", {
    p_payload: payload as never,
    p_key: key(),
  })
  if (error) throw new Error(`encrypt failed: ${error.message}`)
  return data as unknown as string
}

/**
 * Entschluesselt das Geheimnis EINES Postfachs.
 *
 * Der Aufrufer muss den Chiffretext ueber den sitzungsgebundenen Client
 * gelesen haben — dann hat die RLS bereits entschieden, dass es sein eigenes
 * Postfach ist. Diese Funktion prueft keine Berechtigung und soll es nicht:
 * eine zweite Berechtigungsstelle waere eine zweite Wahrheit.
 */
export async function decryptMailboxCredential(
  supabase: SupabaseClient,
  encrypted: string
): Promise<MailboxCredential | null> {
  if (!isEncryptionAvailable()) return null
  const { data, error } = await supabase.rpc("decrypt_tenant_secret_with_key", {
    p_payload: encrypted as never,
    p_key: key(),
  })
  if (error) return null
  const parsed = data as unknown as Partial<MailboxCredential> | null
  if (!parsed || typeof parsed.password !== "string") return null
  return { password: parsed.password }
}

/**
 * Die Spalten, die eine API-Antwort tragen darf.
 *
 * `credential_encrypted` steht hier bewusst NICHT: AC-158.2 sagt zu, dass das
 * Passwort nach dem Speichern nie wieder lesbar ist — auch nicht als
 * Chiffretext, denn ein Chiffretext in einer Antwort ist ein Angriffsziel.
 * Die Liste ist exportiert, damit ein Test sie gegen die echte Auswahl der
 * Routen pruefen kann statt gegen eine Kopie.
 */
export const MAILBOX_PUBLIC_COLUMNS = [
  "id",
  "label",
  "provider",
  "imap_host",
  "imap_port",
  "imap_security",
  "imap_username",
  "status",
  "last_checked_at",
  "last_error_code",
  "created_at",
  "updated_at",
] as const

export const MAILBOX_SELECT = MAILBOX_PUBLIC_COLUMNS.join(", ")
