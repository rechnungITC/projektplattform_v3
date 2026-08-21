/**
 * PROJ-80-α — Auflösung „gehört dieses Dokument zu diesem Projekt?" an EINER
 * Stelle.
 *
 * Warum als Helfer und nicht je Route: die Prüfung stand zweimal kopiert in den
 * Quintessenz-Routen (`GET`, `retry`) und fehlte in der dritten (`PATCH`) — und
 * genau dort wird geschrieben. Der `PATCH` prüfte das Bearbeitungsrecht gegen
 * das Projekt aus dem PFAD, holte die Zeile dann aber allein über
 * `document_id`. Weil die Lese-Policy `document_summaries_select` nur
 * `is_project_member` des EIGENEN Projekts des Dokuments verlangt und der
 * anschließende Schreibvorgang mit service-role läuft, konnte ein Nutzer mit
 * Bearbeitungsrecht in Projekt A die Quintessenz eines Dokuments aus Projekt B
 * ändern, in dem er bloß Betrachter ist. Das Recht wurde am falschen Projekt
 * geprüft.
 *
 * Drei Kopien einer Berechtigungsregel sind die Krankheit, nicht das Symptom
 * (PROJ-130: vier Register, die auseinanderliefen). Deshalb eine Autorität.
 *
 * Gelesen wird ausdrücklich mit der **Nutzersitzung**: die Auflösung ist
 * gleichzeitig die Sichtbarkeitsprüfung. Mit service-role wäre sie wirkungslos
 * — „a report RPC called with the service-role key bypasses every RLS gate
 * above it" (CLAUDE.md).
 */

/**
 * Der Aufrufer übergibt die Abfrage als Funktion, nicht den Client.
 *
 * Der erste Entwurf war ein schmales `from().select().eq().maybeSingle()`-
 * Interface — und war **nicht** typsicher: Supabases Builder ist ein *thenable*,
 * keine `Promise`, und seine Aufrufketten sind generisch überladen. Ein echter
 * `SupabaseClient` ist auf so eine Nachbildung nicht zuweisbar (`TS2345`, dazu
 * ein `TS2589` „type instantiation is excessively deep"). Genau derselbe Fehler
 * wie PROJ-144-F-9 und mit demselben Mittel behoben, das PROJ-130-δ1 für
 * `RpcInvoker` gewählt hat: ein Callback ist typsicher **und** testbar, ohne den
 * halben Client nachzubauen.
 *
 * `PromiseLike` statt `Promise` ist dabei kein Detail, sondern der Kern — der
 * Builder hat `then`, aber kein `catch`/`finally`.
 */
export type SingleRowLookup = (
  table: "documents" | "document_tree_nodes",
  columns: string,
  id: string,
) => PromiseLike<{ data: unknown }>

/**
 * Der Aufrufer schreibt das Callback selbst — zwei Zeilen, contextual typing:
 *
 * ```ts
 * const scope = await resolveDocumentInProject(
 *   (table, columns, id) => supabase.from(table).select(columns).eq("id", id).maybeSingle(),
 *   projectId,
 *   docId,
 * )
 * ```
 *
 * Eine Fabrik `singleRowLookup(supabase)` wäre kürzer, war aber der zweite
 * Anlauf und ebenfalls falsch: sobald ein echter Client gegen eine nachgebaute
 * `from`-Kette geprüft wird, läuft der Compiler in `TS2589` („type instantiation
 * is excessively deep"). Beim Callback wird nichts verglichen — der Parameter
 * wird aus dieser Signatur *abgeleitet*. Dieselbe Auflösung wie bei `RpcInvoker`
 * (PROJ-130-δ1), und die Regel, die hier zählt, liegt ohnehin nicht im Callback,
 * sondern in `resolveDocumentInProject`.
 */

/**
 * Die angeforderten Spalten, exportiert statt eingebettet.
 *
 * Grund: der Schema-Drift-Wächter löst ausschließlich **String-Literale** in
 * einer `.from("…").select("…")`-Kette auf (`ast-walker.ts`). Seit die Abfrage
 * über ein Callback läuft, stehen Tabelle und Spalten in Variablen — der Wächter
 * sieht diese zwei Abfragen also nicht mehr. Das ist ein echter, wenn auch
 * kleiner Verlust an statischer Deckung, und er wird nicht verschwiegen, sondern
 * ersetzt: `document-scope.test.ts` prüft jede dieser Spalten gegen die
 * Migrationsdateien. Das läuft überall, auch ohne Docker.
 */
export const DOCUMENT_SCOPE_COLUMNS = {
  documents: ["id", "tree_node_id", "original_filename", "mime_type"],
  document_tree_nodes: ["project_id", "confidentiality_level"],
} as const

export interface DocumentScope {
  documentId: string
  treeNodeId: string
  projectId: string
  confidentialityLevel: string | null
  originalFilename: string | null
  mimeType: string | null
}

/**
 * Liefert den Projekt-Kontext eines Dokuments — oder `null`, wenn es nicht
 * existiert, für den Aufrufer unsichtbar ist oder zu einem ANDEREN Projekt
 * gehört. Alle drei Fälle sind für den Aufrufer bewusst nicht unterscheidbar:
 * jede Unterscheidung wäre eine Aussage über fremden Bestand.
 */
export async function resolveDocumentInProject(
  lookup: SingleRowLookup,
  projectId: string,
  documentId: string,
): Promise<DocumentScope | null> {
  const { data: doc } = await lookup(
    "documents",
    DOCUMENT_SCOPE_COLUMNS.documents.join(", "),
    documentId,
  )

  const document = doc as {
    id?: string
    tree_node_id?: string
    original_filename?: string | null
    mime_type?: string | null
  } | null
  if (!document?.tree_node_id) return null

  // Die Vertraulichkeitsstufe hängt seit PROJ-Y-115c am Baumknoten, nicht am
  // Dokument. Sie reist mit, damit der Aufrufer für das Zugriffsprotokoll
  // (PROJ-130-δ2) keine zweite Abfrage braucht.
  const { data: nodeRow } = await lookup(
    "document_tree_nodes",
    DOCUMENT_SCOPE_COLUMNS.document_tree_nodes.join(", "),
    document.tree_node_id,
  )

  const node = nodeRow as {
    project_id?: string
    confidentiality_level?: string | null
  } | null
  if (!node?.project_id || node.project_id !== projectId) return null

  return {
    documentId: document.id ?? documentId,
    treeNodeId: document.tree_node_id,
    projectId: node.project_id,
    confidentialityLevel: node.confidentiality_level ?? null,
    originalFilename: document.original_filename ?? null,
    mimeType: document.mime_type ?? null,
  }
}
