/**
 * PROJ-130-δ1 — Auswertung und Protokollierung vertraulicher Lese-Zugriffe.
 *
 * Der Trail protokolliert seit δ1 die Flächen, an denen Inhalte oberhalb von
 * `standard` das System VERLASSEN. Die Stufen-Auswertung liegt hier, damit sie
 * einmal existiert und prüfbar ist — die Aufrufer sind Routen, die sonst jede
 * für sich zählen müssten.
 *
 * Bewusst KEIN Eintrag für `standard`: in Nicht-M&A-Mandanten entsteht damit
 * null Zusatzlast, und der DB-CHECK auf `confidential_read_log` weist eine
 * `standard`-Zeile ohnehin ab.
 */

/** Die geordneten Stufen aus `ma_confidentiality_level`. */
const LEVEL_ORDER = ["standard", "confidential", "strict"] as const

export type ConfidentialityLevel = (typeof LEVEL_ORDER)[number]

export interface ConfidentialitySummary {
  /** Höchste vorkommende Stufe, oder `standard` wenn nichts Vertrauliches dabei ist. */
  maxLevel: ConfidentialityLevel
  /** Anzahl der Zeilen oberhalb von `standard`. */
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
 * Der Aufrufer übergibt den RPC-Aufruf als Funktion, nicht den Client. Grund:
 * Supabases `rpc` ist generisch überladen und passt strukturell auf kein
 * schmales Interface — ein Callback hält den Helfer typsicher UND testbar,
 * ohne den ganzen Client nachbauen zu müssen.
 */
export type RpcInvoker = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ error: { message: string } | null }>

export interface LogExportArgs {
  projectId: string
  /** Muss im entity_type-CHECK von `confidential_read_log` enthalten sein. */
  entityType: "documents" | "dd_questions" | "spa_issues"
  rows: ReadonlyArray<{ confidentiality_level?: string | null }>
  /** z. B. Abschnitt oder Format des Exports. */
  detail?: Record<string, unknown>
}

export interface LogExportResult {
  /** true, wenn ein Eintrag nötig war (also Vertrauliches enthalten ist). */
  logged: boolean
  /** Gesetzt, wenn ein nötiger Eintrag fehlgeschlagen ist. */
  failed: boolean
  summary: ConfidentialitySummary
}

/**
 * Protokolliert einen Export vertraulicher Inhalte. Gibt zurück, ob ein Eintrag
 * nötig war und ob er gelungen ist — die Entscheidung über das Ausfallverhalten
 * bleibt beim Aufrufer, weil sie von der Stufe abhängt: bei `strict` wird der
 * Export verweigert, bei `confidential` nicht.
 */
export async function logConfidentialExport(
  invokeRpc: RpcInvoker,
  { projectId, entityType, rows, detail }: LogExportArgs
): Promise<LogExportResult> {
  const summary = summarizeConfidentiality(rows)
  if (summary.confidentialCount === 0) {
    return { logged: false, failed: false, summary }
  }

  const { error } = await invokeRpc("log_confidential_read", {
    p_project_id: projectId,
    p_entity_type: entityType,
    p_max_level: summary.maxLevel,
    p_object_count: summary.confidentialCount,
    p_action: "export",
    p_outcome: "granted",
    p_entity_id: null,
    p_detail: detail ?? null,
  })

  return { logged: !error, failed: Boolean(error), summary }
}

/**
 * Ausfallverhalten: nur ein fehlgeschlagenes Protokollieren von `strict`
 * blockiert die Ausgabe. Bei `confidential` wäre das Protokoll sonst selbst ein
 * Ausfallrisiko für die gutartige Mehrheit der Zugriffe.
 */
export function mustBlockOnLogFailure(result: LogExportResult): boolean {
  return result.failed && result.summary.maxLevel === "strict"
}
