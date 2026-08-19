/**
 * PROJ-Y-148e — Abgleich des Prod-Funktionsinventars gegen die Migrationsdateien.
 *
 * WAS DIESER WÄCHTER TUT
 * ----------------------
 * Er beantwortet eine Frage: **ist jede Funktion, die in der Produktionsdatenbank
 * existiert, einer bekannten Quelle zuordenbar?** Zuordenbar heißt entweder
 *
 *   (a) eine Migrationsdatei legt sie per `create function` an, oder
 *   (b) sie steht in der Ausnahmeliste unten, mit Begründung.
 *
 * Alles andere ist ein Fund. Genau so entstand PROJ-Y-148c: eine Migration lief
 * fünf Tage in Prod, ohne im Repo zu sein, und legte dabei eine RPC an, die eine
 * append-only-Zusage aushebelte.
 *
 * WAS ER NICHT TUT — und warum, gemessen statt behauptet
 * -----------------------------------------------------
 * - **Keine Funktionskörper.** Ein Vergleich der Rümpfe bräuchte die aus den
 *   Migrationsdateien frisch gebaute Shadow-DB; Docker ist auf dem Entwicklungs-
 *   host nicht verfügbar (offener Handoff PROJ-67/F6), der Wächter wäre also nicht
 *   verifizierbar. Folge: eine Änderung AN einer bestehenden Funktion fängt er
 *   nicht — bei PROJ-Y-148c wären das die vier erweiterten Guards gewesen, die
 *   neue RPC dagegen schon.
 * - **Keine Trigger.** Gemessen am 2026-08-19: ein statischer Parse über die
 *   Migrationsdateien findet 65 von 74 Tabellen mit Audit-Trigger — **10 werden
 *   verfehlt**, weil PROJ-117/118/80/128 und PROJ-130-α ihre Trigger über
 *   DO-Blöcke und Schleifen anlegen. 14 % Fehlerquote sind für einen Wächter
 *   untauglich. (Die Übereinstimmung dieser 65 mit der 65 aus dem PROJ-130-α-Befund
 *   ist Zufall — jene Zahl kam aus einem echten Shadow-DB-Replay. PROJ-Y-130f
 *   bleibt deshalb offen und braucht Docker.)
 * - **Keine Grants und keine Policies.** Gleiche Ursache wie die Rümpfe.
 *
 * WARUM ER GEGEN EINE DATEI PRÜFT UND NICHT GEGEN PROD
 * ---------------------------------------------------
 * Ein npm-Skript hat keinen Weg, `pg_proc` in Prod zu lesen: in `.env.local` liegt
 * kein Connection-String, nur der Service-Role-Key für PostgREST — und PostgREST
 * exponiert Tabellen, Views und RPCs, keine Systemkataloge. Ein Prod-Secret in CI
 * zu legen ist eine Sicherheitsentscheidung, die niemand nebenbei trifft.
 *
 * Deshalb ist `supabase/prod-inventory/functions.txt` **versioniert**: ihre
 * Aktualisierung ist ein bewusster Akt mit sichtbarem Diff im Pull Request. Der
 * Preis ist Prozessdisziplin — veraltet die Datei, findet der Wächter nichts Neues.
 * Der Gewinn ist, dass Divergenz überhaupt sichtbar und benennbar wird, statt
 * still in der Datenbank zu liegen.
 */

/**
 * Ein Eintrag der Ausnahmeliste. Ohne Begründung kein Eintrag — der Test erzwingt das.
 *
 * `kind` trennt zwei grundverschiedene Fälle, die sonst gleich aussehen:
 *
 * - `legacy` — Alt-Bestand, der dauerhaft so bleibt.
 * - `pending_merge` — eine Slice hat ihre Migration bereits in Prod angewendet, ist
 *   aber noch nicht gemergt. Das ist der **normale** Arbeitsablauf dieses Repos
 *   (Migration in `/backend`, Merge später) und deshalb kein Fund. Solche Einträge
 *   sind Wegwerf-Einträge: sobald die Slice mergt, legt eine Migrationsdatei die
 *   Funktion an, und `analyzeInventory` meldet den Eintrag als veraltet.
 */
export interface InventoryException {
  name: string
  reason: string
  kind: "legacy" | "pending_merge"
}

/**
 * Funktionen, die in Prod existieren, ohne dass eine Migrationsdatei sie anlegt.
 *
 * Jeder Eintrag ist eine bewusst akzeptierte Abweichung, nicht ein übersehener
 * Fund. Die beiden hier sind Alt-Bestand aus der Frühzeit des Projekts: der
 * Schema-Drift-Workflow kennt sie und toleriert sie ausdrücklich mit der Meldung
 * "REVOKE/GRANT on missing function — pre-existing migration drift".
 */
export const INVENTORY_EXCEPTIONS: readonly InventoryException[] = [
  {
    name: "enforce_last_lead",
    reason:
      "Alt-Bestand: keine Migrationsdatei legt sie an, `20260428120000_harden_trigger_only_functions.sql` " +
      "revoked sie nur. Der Schema-Drift-Workflow toleriert das ausdrücklich als " +
      "'pre-existing migration drift'. PROJ-148 patcht sie per Anker-Ersetzung aus der Live-Definition.",
    kind: "legacy",
  },
  {
    name: "enforce_project_membership_user_in_tenant",
    reason:
      "Alt-Bestand, gleiche Ursache und gleiche Toleranz wie `enforce_last_lead`: nur ein `revoke execute` " +
      "in `20260428120000`, kein `create function` in irgendeiner Migrationsdatei.",
    kind: "legacy",
  },
  {
    name: "_dd_finding_source_question_guard",
    reason:
      "PROJ-Y-114a (dd-finding-source-ref): Migration `20260817120000` ist seit dem 2026-08-17 in Prod, " +
      "die Slice war am 2026-08-19 noch nicht gemergt. Wegwerf-Eintrag — sobald sie landet, meldet der " +
      "Wächter ihn als veraltet und er ist zu entfernen.",
    kind: "pending_merge",
  },
] as const

export interface InventoryFinding {
  name: string
  kind: "unexplained" | "stale_exception"
}

export interface InventoryResult {
  prodCount: number
  repoCount: number
  exceptionCount: number
  /** In Prod, von keiner Migrationsdatei angelegt, nicht in der Ausnahmeliste. */
  unexplained: string[]
  /** In der Ausnahmeliste, aber gar nicht (mehr) in Prod — die Liste ist veraltet. */
  staleExceptions: string[]
  /**
   * Im Repo angelegt, aber nicht im Prod-Inventar. Rein informativ und **kein
   * Fehler**: eine gerade gemergte Slice, deren Migration noch nicht in Prod ist,
   * landet hier — und ebenso eine bewusst gedroppte Funktion.
   */
  repoOnly: string[]
}

/**
 * Zerlegt eine Inventardatei: eine Funktion pro Zeile, `#` beginnt einen Kommentar,
 * Leerzeilen werden übergangen.
 */
export function parseInventory(text: string): string[] {
  const out = new Set<string>()
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line === "" || line.startsWith("#")) continue
    out.add(line.toLowerCase())
  }
  return [...out].sort()
}

/**
 * Zieht die per `create [or replace] function` angelegten Funktionsnamen aus
 * SQL-Text.
 *
 * Bewusst nur dieses Muster: es ist über alle 220 Migrationsdateien stabil (die
 * Gegenprobe am 2026-08-19 fand 275 Namen gegen 272 in Prod, und die Differenz
 * war vollständig erklärbar). Ein `create function` in einem Kommentar erzeugt
 * einen Namen zu viel — das ist die harmlose Richtung, weil ein zusätzlicher
 * Repo-Name nur `repoOnly` verlängert und niemals einen Fund unterdrückt.
 */
export function extractCreatedFunctions(sql: string): string[] {
  const out = new Set<string>()
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?([a-z0-9_]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) out.add(m[1].toLowerCase())
  return [...out].sort()
}

export function analyzeInventory(
  prodInventory: string[],
  repoFunctions: string[],
  exceptions: readonly InventoryException[] = INVENTORY_EXCEPTIONS
): InventoryResult {
  const prod = new Set(prodInventory.map((n) => n.toLowerCase()))
  const repo = new Set(repoFunctions.map((n) => n.toLowerCase()))
  const allowed = new Set(exceptions.map((e) => e.name.toLowerCase()))

  const unexplained = [...prod]
    .filter((n) => !repo.has(n) && !allowed.has(n))
    .sort()
  // Eine Ausnahme wird auf zwei Wegen zu totem Ballast, und beide sind zu melden:
  // die Funktion ist nicht mehr in Prod, ODER eine Migrationsdatei legt sie
  // inzwischen an. Im zweiten Fall hat sich ein `pending_merge`-Eintrag von selbst
  // erledigt — genau dadurch räumt die Liste sich auf, statt zuzuwachsen. Ohne diese
  // Prüfung würde ein liegengebliebener Eintrag einen künftigen echten Fund gleichen
  // Namens stillschweigend durchlassen.
  const staleExceptions = [...allowed]
    .filter((n) => !prod.has(n) || repo.has(n))
    .sort()
  const repoOnly = [...repo].filter((n) => !prod.has(n)).sort()

  return {
    prodCount: prod.size,
    repoCount: repo.size,
    exceptionCount: allowed.size,
    unexplained,
    staleExceptions,
    repoOnly,
  }
}

/** Exit-relevant: nur unerklärte Funktionen und veraltete Ausnahmen sind Fehler. */
export function hasFailures(r: InventoryResult): boolean {
  return r.unexplained.length > 0 || r.staleExceptions.length > 0
}
