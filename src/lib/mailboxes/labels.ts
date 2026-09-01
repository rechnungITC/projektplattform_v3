/**
 * PROJ-158-α — die Übersetzung von Kennungen in Sätze für Menschen.
 *
 * Bewusst **eine** Stelle: die Routen geben stabile Kennungen zurück
 * (AC-158.9, damit kein Fremdtext mit Zugangsdaten durchsickert), und genau
 * hier werden sie zu Text. Zwei Kopien würden auseinanderlaufen, und die
 * Meldung ist hier der eigentliche Produktwert — sie entscheidet, ob die
 * Administration den Fehler beim Passwort sucht oder beim Anbieter.
 */

import type { MailboxProvider, MailboxSecurity } from "./validation"
import type { MailboxStatus } from "./api"

export const PROVIDER_LABELS: Record<MailboxProvider, string> = {
  imap: "Eigener IMAP-Server",
  microsoft365: "Microsoft 365",
  gmail: "Gmail",
}

export const SECURITY_LABELS: Record<MailboxSecurity, string> = {
  tls: "TLS (empfohlen, Port 993)",
  starttls: "STARTTLS (Port 143)",
}

export interface StatusPresentation {
  label: string
  tone: "neutral" | "success" | "warning" | "danger"
  /** Was der Nutzer als Nächstes tun kann — leer, wenn nichts zu tun ist. */
  hint?: string
}

export const STATUS_PRESENTATION: Record<MailboxStatus, StatusPresentation> = {
  unchecked: {
    label: "Noch nicht geprüft",
    tone: "neutral",
    hint: "Prüfe die Verbindung, bevor du dich darauf verlässt.",
  },
  connected: { label: "Verbunden", tone: "success" },
  auth_failed: {
    label: "Anmeldung fehlgeschlagen",
    tone: "danger",
    hint: "Benutzername oder Passwort stimmen nicht. Bei aktivierter Zwei-Faktor-Anmeldung braucht dein Server ein eigenes Kennwort für Programme.",
  },
  unreachable: {
    label: "Server nicht erreichbar",
    tone: "danger",
    hint: "Server, Port oder Verschlüsselung prüfen — die Anmeldung wurde gar nicht erst versucht.",
  },
  mailbox_disabled: {
    // Der wichtigste der Fälle: ohne eigene Meldung sucht man stundenlang
    // beim Passwort, obwohl der Zugang serverseitig abgeschaltet ist.
    label: "IMAP ist für dieses Postfach abgeschaltet",
    tone: "danger",
    hint: "Der Zugang muss beim Anbieter freigeschaltet werden — am Passwort liegt es nicht.",
  },
  consent_required: {
    label: "Zustimmung erforderlich",
    tone: "warning",
    hint: "Die Freigabe beim Anbieter ist abgelaufen oder wurde widerrufen.",
  },
  error: {
    label: "Prüfung fehlgeschlagen",
    tone: "danger",
    hint: "Unerwarteter Fehler. Bitte erneut prüfen.",
  },
}

/** Eingabefehler der Adressprüfung. */
export const HOST_ERROR_LABELS: Record<string, string> = {
  host_empty: "Bitte einen Server angeben.",
  host_too_long: "Der Servername ist zu lang.",
  host_malformed:
    "Bitte nur den Servernamen angeben — ohne https://, ohne Pfad und ohne Benutzername.",
  host_reserved:
    "Diese Adresse zeigt ins interne Netz und ist nicht zulässig. Bitte den öffentlich erreichbaren Servernamen angeben.",
  port_invalid: "Bitte einen Port zwischen 1 und 65535 angeben.",
}

/**
 * Der Zustand ist ein **gespeichertes Prüfergebnis**, keine Live-Aussage
 * (Tech Design Q3). Deshalb wird er nie ohne seinen Zeitpunkt gezeigt — sonst
 * läse sich „Verbunden" als Gewissheit, obwohl eine widerrufene Freigabe
 * zwischen zwei Prüfungen unsichtbar bleibt.
 */
export function describeLastCheck(iso: string | null): string {
  if (!iso) return "noch nie geprüft"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "Prüfzeitpunkt unbekannt"
  return `zuletzt geprüft am ${d.toLocaleDateString("de-DE")} um ${d.toLocaleTimeString(
    "de-DE",
    { hour: "2-digit", minute: "2-digit" }
  )}`
}
