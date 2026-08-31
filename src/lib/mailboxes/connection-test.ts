/**
 * PROJ-158-α — die Verbindungspruefung.
 *
 * AC-158.7 sagt dem Nutzer zu: **es wird keine Nachricht gelesen,
 * heruntergeladen oder gespeichert**. Diese Datei ist der Ort, an dem die
 * Zusage eingeloest wird — nicht die Oberflaeche.
 *
 * Wie sie eingeloest wird (Tech Design Q5, drei Ebenen):
 *
 *   1. STRUKTURELL — diese Datei benutzt vom Client ausschliesslich `connect`,
 *      `list` und `logout`. Es gibt hier keinen Aufruf, der Nachrichten
 *      beruehrt (`fetch`, `fetchOne`, `download`, `search`, `mailboxOpen`),
 *      und insbesondere wird KEIN Postfachordner geoeffnet — `list` liest nur
 *      das Verzeichnis. Ein geoeffneter Ordner koennte je nach Server bereits
 *      Zustand veraendern.
 *   2. IM TEST — `connection-test.test.ts` haelt fest, dass ein Client-Doppel
 *      waehrend einer Pruefung keine dieser Methoden zu sehen bekommt.
 *   3. IN DER ABNAHME — gegen ein echtes Postfach wird geprueft, dass danach
 *      keine Nachricht als gelesen markiert ist.
 *
 * Die dritte Ebene traegt allein nicht, die erste ist ohne die zweite nicht
 * gegen spaetere Aenderungen geschuetzt — deshalb alle drei.
 */

import type { MailboxSecurity } from "./validation"

/** Stabile Gruende. Der Text fuer den Nutzer entsteht in der Oberflaeche. */
export type MailboxCheckCode =
  | "connected"
  | "auth_failed"
  | "unreachable"
  | "mailbox_disabled"
  | "timeout"
  | "error"

export interface MailboxCheckResult {
  code: MailboxCheckCode
  /** Anzahl gefundener Ordner — der einzige Wert, den die Pruefung liest. */
  folderCount?: number
}

export interface MailboxCheckInput {
  host: string
  port: number
  security: MailboxSecurity
  username: string
  password: string
}

/** AC-158.10 — eine haengende Gegenstelle darf nicht zum Dauerzustand werden. */
export const MAILBOX_CHECK_TIMEOUT_MS = 15_000

/**
 * Die Menge der Methoden, die eine Pruefung NIE aufrufen darf. Sie steht hier
 * und nicht im Test, damit beide dieselbe Liste benutzen — eine im Test
 * gepflegte Kopie wuerde beim naechsten Bibliotheks-Update veralten, ohne dass
 * jemand es merkt.
 */
export const FORBIDDEN_DURING_CHECK = [
  "fetch",
  "fetchOne",
  "fetchAll",
  "download",
  "search",
  "mailboxOpen",
  "messageFlagsAdd",
  "append",
] as const

/**
 * Uebersetzt den Fehler der Gegenstelle in eine stabile Kennung.
 *
 * AC-158.9: der rohe Text wird NICHT durchgereicht — er kann den
 * Benutzernamen, interne Hostnamen oder das Passwort enthalten. Was hier
 * herauskommt, ist eine Kennung ohne Eingabedaten.
 */
export function classifyMailboxError(err: unknown): MailboxCheckCode {
  const raw = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  const t = raw.toLowerCase()

  // Reihenfolge zaehlt: „IMAP disabled" enthaelt oft auch „auth".
  if (t.includes("imap") && t.includes("disabled")) return "mailbox_disabled"
  if (t.includes("not enabled") || t.includes("nicht aktiviert")) {
    return "mailbox_disabled"
  }
  if (
    t.includes("authenticationfailed") ||
    t.includes("invalid credentials") ||
    t.includes("login failed") ||
    t.includes("authenticate") ||
    t.includes("auth")
  ) {
    return "auth_failed"
  }
  if (
    t.includes("enotfound") ||
    t.includes("econnrefused") ||
    t.includes("ehostunreach") ||
    t.includes("enetunreach") ||
    t.includes("certificate") ||
    t.includes("socket")
  ) {
    return "unreachable"
  }
  if (t.includes("timeout") || t.includes("etimedout")) return "timeout"
  return "error"
}

/**
 * Minimale Schnittstelle des Clients — absichtlich schmal gehalten. Was hier
 * nicht steht, kann diese Datei nicht aufrufen; das ist Ebene 1 des Nachweises
 * und zugleich der Grund, warum der Test einen Doppelgaenger einsetzen kann.
 */
export interface NarrowImapClient {
  connect(): Promise<void>
  list(): Promise<unknown[]>
  logout(): Promise<void>
}

export type NarrowClientFactory = (
  input: MailboxCheckInput
) => NarrowImapClient

/**
 * Baut den echten Client. Der dynamische Import haelt die Bibliothek aus dem
 * Startpfad heraus — sie wird nur geladen, wenn wirklich geprueft wird
 * (dasselbe Vorgehen wie bei den Datei-Parsern aus PROJ-70-γ).
 */
export const defaultClientFactory: NarrowClientFactory = (input) => {
  let clientPromise: Promise<{
    connect(): Promise<void>
    list(): Promise<unknown[]>
    logout(): Promise<void>
  }> | null = null

  const load = async () => {
    if (!clientPromise) {
      clientPromise = import("imapflow").then(({ ImapFlow }) => {
        return new ImapFlow({
          host: input.host,
          port: input.port,
          secure: input.security === "tls",
          auth: { user: input.username, pass: input.password },
          // Die Bibliothek bringt einen eigenen Logger mit. Er wird
          // stillgelegt: seine Ausgabe enthaelt Verbindungsdetails und
          // potenziell Kopfzeilen, und das Haus protokolliert ueber Sentry.
          logger: false,
        }) as unknown as {
          connect(): Promise<void>
          list(): Promise<unknown[]>
          logout(): Promise<void>
        }
      })
    }
    return clientPromise
  }

  return {
    async connect() {
      const c = await load()
      await c.connect()
    },
    async list() {
      const c = await load()
      return c.list()
    },
    async logout() {
      const c = await load()
      await c.logout()
    },
  }
}

/**
 * Fuehrt die Pruefung durch: verbinden, Ordnerverzeichnis lesen, abmelden.
 *
 * Gibt IMMER ein Ergebnis zurueck und wirft nicht — der Aufrufer soll den
 * Zustand speichern koennen, gerade wenn es schiefging.
 */
export async function runMailboxCheck(
  input: MailboxCheckInput,
  factory: NarrowClientFactory = defaultClientFactory,
  timeoutMs: number = MAILBOX_CHECK_TIMEOUT_MS
): Promise<MailboxCheckResult> {
  const client = factory(input)
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("ETIMEDOUT: mailbox check timeout")),
        timeoutMs
      )
    })

    const probe = (async () => {
      await client.connect()
      // NUR das Verzeichnis. Kein Ordner wird geoeffnet (AC-158.7).
      const folders = await client.list()
      return Array.isArray(folders) ? folders.length : 0
    })()

    const folderCount = await Promise.race([probe, timeout])
    return { code: "connected", folderCount }
  } catch (err) {
    return { code: classifyMailboxError(err) }
  } finally {
    if (timer) clearTimeout(timer)
    // Ein fehlgeschlagenes Abmelden darf das Ergebnis nicht ueberschreiben.
    try {
      await client.logout()
    } catch {
      /* bewusst geschluckt */
    }
  }
}
