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

/** Warum das Geheimnis nicht gelesen werden konnte. */
export type MailboxCredentialFailure =
  /** Der Server hat keinen Schluessel — nichts kann entschluesselt werden. */
  | "encryption_unavailable"
  /** Die Zeile ist fuer den Aufrufer nicht (mehr) sichtbar. */
  | "not_found"
  /** Die Zeile existiert, traegt aber kein Geheimnis. Erneut speichern hilft. */
  | "no_credential"
  /** Entschluesselung fehlgeschlagen — falscher Schluessel oder defekte Daten. */
  | "decrypt_failed"

export type MailboxCredentialResult =
  | { ok: true; credential: MailboxCredential }
  | { ok: false; reason: MailboxCredentialFailure }

/**
 * Entschluesselt das Geheimnis EINES Postfachs.
 *
 * Uebergeben wird die KENNUNG, nicht der Chiffretext — dieser verlaesst die
 * Datenbank damit gar nicht mehr. Die Datenbankfunktion ist
 * `SECURITY INVOKER`: sie liest `user_mailboxes` im Rechtekontext des
 * Aufrufers, die vier Policies aus PROJ-158 entscheiden. Es gibt deshalb
 * weiterhin **keine zweite Berechtigungsstelle**.
 *
 * QA-Befund F-2 (PROJ-Y-158a): die Vorfassung rief
 * `decrypt_tenant_secret_with_key` mit `p_payload`. Diese Signatur gibt es
 * nicht — die Funktion nimmt `p_secret_id uuid` und holt den Chiffretext
 * selbst aus `tenant_secrets`; live gemessen antwortete der Aufruf mit
 * `42883`. Jede Verbindungspruefung endete damit in 503. Die Asymmetrie war
 * kein Versehen: `decrypt_tenant_secret` traegt die Berechtigungsregel der
 * Konnektoren (`is_tenant_admin`), die fuer ein nutzereigenes Postfach in
 * beide Richtungen falsch waere.
 *
 * Der Rueckgabewert unterscheidet die Gruende, weil sie zu verschiedenen
 * naechsten Schritten fuehren: „kein Geheimnis hinterlegt" laesst sich durch
 * erneutes Speichern beheben, „nicht sichtbar" nicht.
 */
export async function decryptMailboxCredential(
  supabase: SupabaseClient,
  mailboxId: string
): Promise<MailboxCredentialResult> {
  if (!isEncryptionAvailable()) {
    return { ok: false, reason: "encryption_unavailable" }
  }
  const { data, error } = await supabase.rpc(
    "decrypt_user_mailbox_credential",
    { p_mailbox_id: mailboxId, p_key: key() }
  )
  if (error) {
    // P0002 kommt aus der Datenbankfunktion, wenn die Zeile fuer den Aufrufer
    // nicht sichtbar ist. Alles andere ist ein echter Fehlschlag.
    const code = (error as { code?: string }).code
    return {
      ok: false,
      reason: code === "P0002" ? "not_found" : "decrypt_failed",
    }
  }
  const parsed = data as unknown as Partial<MailboxCredential> | null
  if (!parsed) return { ok: false, reason: "no_credential" }
  if (typeof parsed.password !== "string") {
    return { ok: false, reason: "decrypt_failed" }
  }
  return { ok: true, credential: { password: parsed.password } }
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
