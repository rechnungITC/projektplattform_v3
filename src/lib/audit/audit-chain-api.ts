/**
 * PROJ-Y-130m — Kettenstatus für die Oberfläche (Followup aus PROJ-130-ε).
 *
 * ε hat Anker, Siegel-Cron und Verifikations-RPC gebaut; bedienbar war die Prüfung
 * nur über die API. Hier kommt die Auswertung für die Anzeige dazu.
 *
 * Der Kern dieses Moduls ist NICHT der fetch, sondern `describeChainStatus`: die
 * rohe Antwort lässt sich leicht falsch lesen. `intact: true` bei
 * `windows_checked: 0` heißt „es ist noch nichts gesiegelt", nicht „alles in
 * Ordnung" — wer das als Entwarnung anzeigt, behauptet einen Nachweis, den es
 * nicht gibt. Genau diese Unterscheidung ist hier unit-getestet.
 */

export type ChainSource = "audit_log" | "confidential_read"

/** Klartext für die zwei Ketten (PROJ-Y-130n). */
export const CHAIN_SOURCE_LABEL: Record<ChainSource, string> = {
  audit_log: "Änderungs-Trail",
  confidential_read: "Zugriffsprotokoll",
}

export interface ChainSourceSummary {
  source: ChainSource
  windows_checked: number
  intact: boolean
  last_window_start: string | null
}

export interface AuditChainFinding {
  /** PROJ-Y-130n: welche der beiden Ketten betroffen ist. */
  source: ChainSource
  window_start: string
  entry_count_sealed: number
  entry_count_now: number
  digest_ok: boolean
  link_ok: boolean
}

export interface AuditChainStatus {
  windows_checked: number
  intact: boolean
  findings: AuditChainFinding[]
  last_window_start: string | null
  /** Je Kette getrennt — die beiden Ketten laufen unabhängig (PROJ-Y-130n). */
  sources: ChainSourceSummary[]
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export async function fetchAuditChainStatus(
  tenantId: string
): Promise<AuditChainStatus> {
  const res = await fetch(
    `/api/tenants/${encodeURIComponent(tenantId)}/audit-chain`,
    { cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return (await res.json()) as AuditChainStatus
}

export type ChainTone = "ok" | "pending" | "alarm"

export interface ChainVerdict {
  tone: ChainTone
  headline: string
  detail: string
}

/**
 * Übersetzt die Antwort in eine Aussage, die man einem Prüfer zeigen kann.
 *
 * Drei Fälle, die auseinandergehalten werden müssen:
 *  - noch nichts gesiegelt  -> KEINE Entwarnung, sondern „noch kein Nachweis"
 *  - alles nachgerechnet    -> Entwarnung, mit Zahl der geprüften Fenster
 *  - Abweichung             -> Alarm, und zwar nach Art getrennt (siehe unten)
 */
export function describeChainStatus(status: AuditChainStatus): ChainVerdict {
  if (status.windows_checked === 0) {
    return {
      tone: "pending",
      headline: "Noch keine gesiegelten Fenster",
      detail:
        "Die Prüfwert-Kette entsteht nächtlich um 03:45 UTC. Bis zum ersten Siegel-Lauf gibt es nichts nachzurechnen — das ist ausdrücklich keine Entwarnung.",
    }
  }

  if (status.intact) {
    return {
      tone: "ok",
      headline: `${status.windows_checked} Fenster nachgerechnet, keine Abweichung`,
      detail:
        "Inhalt und Verkettung stimmen für jedes gesiegelte Fenster. Eine Manipulation am Audit-Trail hätte hier auffallen müssen.",
    }
  }

  // Die beiden Bruch-Arten getrennt benennen: sie bedeuten Verschiedenes und
  // führen zu verschiedenen nächsten Schritten.
  const contentBroken = status.findings.filter((f) => !f.digest_ok).length
  const linkBroken = status.findings.filter((f) => !f.link_ok).length
  const parts: string[] = []
  if (contentBroken > 0) {
    parts.push(
      `${contentBroken} Fenster mit verändertem Inhalt (Einträge wurden nachträglich geändert, gelöscht oder zurückdatiert)`
    )
  }
  if (linkBroken > 0) {
    parts.push(
      `${linkBroken} Fenster mit gebrochener Verkettung (der Anker selbst wurde verändert — typisch für den Versuch, eine Fälschung zu verdecken)`
    )
  }

  return {
    tone: "alarm",
    headline: `${status.findings.length} von ${status.windows_checked} Fenstern weichen ab`,
    detail: `${parts.join(" · ")}. Beides ist nur möglich, wenn die Schreibschutz-Wächter auf Datenbankebene entfernt wurden.`,
  }
}

/** Kurzlabel für eine einzelne Abweichung (Tabellenzelle). */
export function sourceLabel(source: string): string {
  return CHAIN_SOURCE_LABEL[source as ChainSource] ?? source
}

export function findingKind(finding: AuditChainFinding): string {
  if (!finding.digest_ok && !finding.link_ok) return "Inhalt + Anker"
  if (!finding.digest_ok) return "Inhalt verändert"
  if (!finding.link_ok) return "Anker verändert"
  return "—"
}
