/**
 * PROJ-130-δ1/δ2 — Auswertung und Protokollierung vertraulicher Lese-Zugriffe.
 *
 * δ1 hat die Flächen protokolliert, an denen Inhalte oberhalb von `standard` das
 * System VERLASSEN (signierter Download-Link, CSV-Export). δ2 ergänzt die
 * Auswertungen (Steering / Operativ / DD-Bericht) und das In-App-Lesen der
 * Inhalts-Listen — und zieht die Stufen-Regel an genau EINE Stelle:
 *
 *   Austritt      (Download-Link, CSV-Export, Druckseite) -> ab `confidential`
 *   In-App-Lesen  (Liste, Auswertungs-Ansicht)            -> NUR bei `strict`
 *
 * Warum diese Asymmetrie: `strict` ist die Stufe, für die Rechenschaft überhaupt
 * zugesagt ist, und sie ist selten — die Mengenkurve bleibt flach und ein
 * Nicht-M&A-Mandant trägt null Zusatzlast. Würde In-App-Lesen schon ab
 * `confidential` protokolliert, schriebe jede Bewertungsliste mit
 * (`ma_valuations` trägt `confidential` als Default).
 *
 * Die Entprellung wiederholter Lesevorgänge liegt bewusst NICHT hier, sondern in
 * der RPC (eine Zeile pro 15-Minuten-Fenster) — sie muss auch dann greifen, wenn
 * ein künftiger Aufrufer diesen Helfer umgeht.
 */

/** Die geordneten Stufen aus `ma_confidentiality_level`. */
const LEVEL_ORDER = ["standard", "confidential", "strict"] as const

export type ConfidentialityLevel = (typeof LEVEL_ORDER)[number]

/**
 * Objektarten, die `confidential_read_log.entity_type` annimmt. Union wird aus
 * dem Array ABGELEITET, nicht daneben gepflegt — genau die Drift, die γ3 im
 * Audit-Objektarten-Register aufgeräumt hat (dort waren Union und Array zwei
 * handgepflegte Kopien und liefen auf 15 gegen 88 auseinander).
 * Spiegelt den CHECK aus Migration 20260812093000; ein Test pinnt die Menge.
 */
export const CONFIDENTIAL_ENTITY_TYPES = [
  "documents",
  "dd_streams",
  "dd_questions",
  "dd_findings",
  "dd_finding_escalations",
  "spa_issues",
  "ma_valuations",
  "ma_project_profiles",
  "deliverables",
  "risks",
  "workstreams",
  "committees",
  "committee_meetings",
  "steering_report",
  "operative_report",
  "dd_report",
] as const

export type ConfidentialEntityType = (typeof CONFIDENTIAL_ENTITY_TYPES)[number]

/**
 * Die Fläche, über die gelesen wurde. Entscheidet über Schwelle UND Aktion —
 * `print` ist Austritt (das Ergebnis wird zu einer PDF-Datei), `view` ist
 * In-App-Lesen derselben Auswertung.
 */
export const READ_SURFACES = ["list", "view", "print", "export", "download"] as const

export type ReadSurface = (typeof READ_SURFACES)[number]

const EGRESS_SURFACES: ReadonlySet<ReadSurface> = new Set<ReadSurface>([
  "print",
  "export",
  "download",
])

/** Aktions-Vokabular von `confidential_read_log.action`. */
const SURFACE_ACTION: Record<ReadSurface, string> = {
  list: "list_read",
  view: "report_read",
  print: "report_read",
  // Die Aktion heißt `download_url_issued` und nicht `download`: protokollierbar
  // ist nur die Ausgabe des signierten Links, eingelöst wird er außerhalb der
  // Anwendung. Das Protokoll sagt „Zugriff wurde ermöglicht", nicht „Datei
  // wurde geladen".
  download: "download_url_issued",
  export: "export",
}

/**
 * Der Schlüssel `confidentiality`, den die drei Auswertungs-Funktionen seit δ2
 * mitliefern. Absichtlich als PFLICHTFELD in den Report-Typen verankert: fällt er
 * bei einem künftigen Umbau aus der Auswertung heraus, bricht der Build, statt
 * dass die Protokollierung still verstummt (γ3-Lehre).
 */
export interface ReportConfidentiality {
  max_level: ConfidentialityLevel
  confidential_count: number
}

export interface ConfidentialitySummary {
  /** Höchste vorkommende Stufe, oder `standard` wenn nichts Vertrauliches dabei ist. */
  maxLevel: ConfidentialityLevel
  /** Anzahl der Objekte oberhalb von `standard`. */
  confidentialCount: number
}

function rank(level: string | null | undefined): number {
  const i = LEVEL_ORDER.indexOf(level as ConfidentialityLevel)
  return i < 0 ? 0 : i
}

/**
 * Fasst eine Ergebnismenge zusammen: höchste Stufe und Anzahl der vertraulichen
 * Zeilen. Unbekannte oder fehlende Stufen zählen als `standard` — ein Wert, den
 * niemand gesetzt hat, darf nicht als vertraulich durchgehen und umgekehrt auch
 * keinen Eintrag erzwingen.
 */
export function summarizeConfidentiality(
  rows: ReadonlyArray<{ confidentiality_level?: string | null }>
): ConfidentialitySummary {
  let maxRank = 0
  let count = 0
  for (const row of rows) {
    const r = rank(row.confidentiality_level)
    if (r > 0) count += 1
    if (r > maxRank) maxRank = r
  }
  return { maxLevel: LEVEL_ORDER[maxRank], confidentialCount: count }
}

/**
 * Die Stufen-Regel aus dem Kopfkommentar, an einer Stelle und prüfbar.
 * Austritt ab `confidential`, In-App-Lesen nur bei `strict`, `standard` nie.
 */
export function shouldLogRead(surface: ReadSurface, level: ConfidentialityLevel): boolean {
  if (level === "standard") return false
  return EGRESS_SURFACES.has(surface) ? true : level === "strict"
}

/**
 * Der Aufrufer übergibt den RPC-Aufruf als Funktion, nicht den Client. Grund:
 * Supabases `rpc` ist generisch überladen und passt strukturell auf kein
 * schmales Interface — ein Callback hält den Helfer typsicher UND testbar,
 * ohne den ganzen Client nachbauen zu müssen.
 */
export type RpcInvoker = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ error: { message: string } | null }>

export interface LogAccessArgs {
  projectId: string
  entityType: ConfidentialEntityType
  surface: ReadSurface
  summary: ConfidentialitySummary
  /** Nur bei Einzelobjekt-Zugriffen (Download); bei Listen und Auswertungen null. */
  entityId?: string | null
  detail?: Record<string, unknown>
}

export interface LogAccessResult {
  /** true, wenn ein Eintrag nötig war UND geschrieben wurde. */
  logged: boolean
  /** Gesetzt, wenn ein nötiger Eintrag fehlgeschlagen ist. */
  failed: boolean
  summary: ConfidentialitySummary
}

/** δ1-Name, aus Kompatibilität erhalten. */
export type LogExportResult = LogAccessResult

/**
 * Einziger Schreibaufruf dieses Moduls. Entscheidet über `shouldLogRead`, ob
 * überhaupt protokolliert wird, und gibt zurück, ob ein nötiger Eintrag gelungen
 * ist — das Ausfallverhalten bleibt beim Aufrufer, weil es von der Stufe abhängt
 * (`mustBlockOnLogFailure`).
 */
export async function logConfidentialAccess(
  invokeRpc: RpcInvoker,
  { projectId, entityType, surface, summary, entityId, detail }: LogAccessArgs
): Promise<LogAccessResult> {
  if (!shouldLogRead(surface, summary.maxLevel)) {
    return { logged: false, failed: false, summary }
  }

  const { error } = await invokeRpc("log_confidential_read", {
    p_project_id: projectId,
    p_entity_type: entityType,
    p_max_level: summary.maxLevel,
    p_object_count: Math.max(summary.confidentialCount, 1),
    p_action: SURFACE_ACTION[surface],
    p_outcome: "granted",
    p_entity_id: entityId ?? null,
    p_detail: detail ?? null,
  })

  return { logged: !error, failed: Boolean(error), summary }
}

export interface LogRowsArgs {
  projectId: string
  entityType: ConfidentialEntityType
  rows: ReadonlyArray<{ confidentiality_level?: string | null }>
  detail?: Record<string, unknown>
}

/**
 * Protokolliert einen Export vertraulicher Inhalte (δ1). Ein Ereignis pro Export
 * mit der höchsten Stufe und der Anzahl der vertraulichen Zeilen — nicht eine
 * Zeile pro Datensatz.
 */
export async function logConfidentialExport(
  invokeRpc: RpcInvoker,
  { projectId, entityType, rows, detail }: LogRowsArgs
): Promise<LogAccessResult> {
  return logConfidentialAccess(invokeRpc, {
    projectId,
    entityType,
    surface: "export",
    summary: summarizeConfidentiality(rows),
    detail,
  })
}

/**
 * Protokolliert das In-App-Lesen einer Inhalts-Liste (δ2). Schreibt NUR, wenn die
 * Antwort `strict`-Inhalte enthält — bei `confidential` und `standard` entsteht
 * kein Eintrag und kein zusätzlicher Datenbank-Aufruf. Die Zusammenfassung wird
 * über die Zeilen gebildet, die der Aufrufer wirklich bekommt (RLS hat vorher
 * gefiltert), nicht über die Tabelle.
 */
export async function logConfidentialListRead(
  invokeRpc: RpcInvoker,
  { projectId, entityType, rows, detail }: LogRowsArgs
): Promise<LogAccessResult> {
  return logConfidentialAccess(invokeRpc, {
    projectId,
    entityType,
    surface: "list",
    summary: summarizeConfidentiality(rows),
    detail,
  })
}

/**
 * Protokolliert die Ausgabe eines signierten Download-Links (δ1, jetzt über die
 * gemeinsame Regel statt inline in der Route).
 */
export async function logConfidentialDownload(
  invokeRpc: RpcInvoker,
  args: {
    projectId: string
    documentId: string
    level: string | null | undefined
    detail?: Record<string, unknown>
  }
): Promise<LogAccessResult> {
  return logConfidentialAccess(invokeRpc, {
    projectId: args.projectId,
    entityType: "documents",
    surface: "download",
    summary: summarizeConfidentiality([{ confidentiality_level: args.level }]),
    entityId: args.documentId,
    detail: args.detail,
  })
}

/**
 * Die Stufen-Zusammenfassung einer Auswertung kommt aus der Auswertung selbst
 * (Schlüssel `confidentiality`, Migration 20260812093000) und NICHT aus ihrer
 * Nutzlast: `steering_report` aggregiert Stage-Gates, `operative_report` und
 * `dd_report_consolidated` aggregieren Findings und Fragen zu Zählern, deren
 * Stufen in der Nutzlast nie erscheinen. Aus der Nutzlast gerechnet würde der
 * Höchstwert UNTERberichten — die gefährliche Richtung für ein Protokoll.
 */
export function reportConfidentialitySummary(payload: {
  confidentiality?: { max_level?: string | null; confidential_count?: number | null } | null
}): ConfidentialitySummary {
  const raw = payload.confidentiality
  const maxRank = rank(raw?.max_level)
  return {
    maxLevel: LEVEL_ORDER[maxRank],
    confidentialCount: Math.max(raw?.confidential_count ?? 0, 0),
  }
}

/**
 * Protokolliert das Lesen einer Auswertung. `view` ist In-App-Lesen (nur
 * `strict`), `print` und `export` sind Austritt (ab `confidential`).
 */
export async function logConfidentialReportRead(
  invokeRpc: RpcInvoker,
  args: {
    projectId: string
    report: "steering_report" | "operative_report" | "dd_report"
    surface: Extract<ReadSurface, "view" | "print" | "export">
    payload: Parameters<typeof reportConfidentialitySummary>[0]
    detail?: Record<string, unknown>
  }
): Promise<LogAccessResult> {
  return logConfidentialAccess(invokeRpc, {
    projectId: args.projectId,
    entityType: args.report,
    surface: args.surface,
    summary: reportConfidentialitySummary(args.payload),
    detail: { ...(args.detail ?? {}), surface: args.surface },
  })
}

/**
 * Einheitliche Meldung, wenn ein `strict`-Zugriff nicht protokolliert werden
 * konnte und deshalb nicht ausgeliefert wird. Eine Formulierung an einer Stelle,
 * damit 14 Leseflächen nicht 14 Varianten desselben Satzes tragen.
 */
export const STRICT_LOG_FAILED_MESSAGE =
  "Der Zugriff betrifft streng vertrauliche Inhalte und konnte nicht protokolliert werden — er wurde deshalb nicht ausgeliefert."

/**
 * Ausfallverhalten: nur ein fehlgeschlagenes Protokollieren von `strict`
 * blockiert die Ausgabe. Bei `confidential` wäre das Protokoll sonst selbst ein
 * Ausfallrisiko für die gutartige Mehrheit der Zugriffe.
 */
export function mustBlockOnLogFailure(result: LogAccessResult): boolean {
  return result.failed && result.summary.maxLevel === "strict"
}
