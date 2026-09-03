/**
 * PROJ-158-α — Eingabepruefung fuer Postfach-Anbindungen.
 *
 * Die Liste reservierter Adressbereiche wird NICHT kopiert, sondern aus
 * PROJ-115 importiert. Eine zweite Kopie wuerde auseinanderlaufen, und die
 * Bereiche sind dieselben — ein Postfach-Host darf so wenig ins interne Netz
 * zeigen wie ein Dokumentenverweis (AC-158.19).
 *
 * Bewusst KEIN DNS-Aufruf: ein Name kann zwischen Pruefung und Verbindung auf
 * eine andere Adresse zeigen, eine Aufloesung hier waere also
 * Scheinsicherheit. Geprueft wird, was der Nutzer eingibt.
 */

import {
  isReservedIpv4,
  isReservedIpv6,
} from "@/lib/ma-project/external-link-validation"

/** Anbieterarten. `microsoft365` und `gmail` sind erst ab β nutzbar. */
export const MAILBOX_PROVIDERS = ["imap", "microsoft365", "gmail"] as const
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number]

/** In α ueber die Anwendungsschicht erlaubt — die Ablage kennt schon alle drei. */
export const ALPHA_PROVIDERS: readonly MailboxProvider[] = ["imap"]

export const MAILBOX_SECURITY = ["tls", "starttls"] as const
export type MailboxSecurity = (typeof MAILBOX_SECURITY)[number]

export interface HostValidation {
  ok: boolean
  /** Stabile Kennung, nicht der Text fuer den Nutzer — der wird in der UI uebersetzt. */
  code?:
    | "host_empty"
    | "host_too_long"
    | "host_malformed"
    | "host_reserved"
    | "port_invalid"
}

const MAX_HOST_LENGTH = 253 // RFC 1035

/**
 * Prueft Host und Port einer IMAP-Anbindung.
 *
 * Abgewiesen wird alles, was ins interne Netz zeigen koennte, sowie eine
 * Eingabe, die gar kein Hostname ist. Ein durchgelassener Wert ist damit
 * *plausibel*, nicht *erreichbar* — Letzteres sagt erst die Verbindungspruefung.
 */
export function validateMailboxHost(
  hostRaw: string,
  port: number
): HostValidation {
  const host = hostRaw.trim().toLowerCase()

  if (!host) return { ok: false, code: "host_empty" }
  if (host.length > MAX_HOST_LENGTH) return { ok: false, code: "host_too_long" }

  // Ein Schema, ein Pfad, Zugangsdaten oder Leerzeichen im Host bedeuten, dass
  // hier etwas anderes eingegeben wurde als ein Hostname.
  if (/[\s/\\@]/.test(host) || host.includes(":")) {
    // Ausnahme: eine blanke IPv6-Adresse enthaelt Doppelpunkte und ist zulaessig,
    // sofern sie nicht reserviert ist.
    if (!/^[0-9a-f:]+$/.test(host)) return { ok: false, code: "host_malformed" }
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, code: "host_reserved" }
  }
  if (isReservedIpv4(host) || isReservedIpv6(host)) {
    return { ok: false, code: "host_reserved" }
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, code: "port_invalid" }
  }

  return { ok: true }
}
