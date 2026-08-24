/**
 * PROJ-Y-114d — die Herkunfts-Verknüpfung darf keine unsichtbare Frage verraten.
 *
 * Gefunden als Vektor **T** der PROJ-Y-114a-QA: die Schreibseite ist dicht (wer
 * eine `strict`-Frage als Quelle *benennen* will, braucht die Freigabe — Pentest
 * G/H/P), die **Leseseite** war es nicht. `FINDING_SELECT` liefert
 * `source_dd_question_id` an jeden, der das Finding lesen darf — auch an eine
 * Projektleitung ohne Freigabe für die verknüpfte Frage. Kein Inhaltsabfluss (die
 * Frage selbst bleibt unsichtbar, die Kennung ist nicht auflösbar), aber die
 * **Existenz** war ablesbar; dieselbe Klasse wie PROJ-107-F-2 und PROJ-120-F-1.
 *
 * Die Autorität ist bewusst **die RLS des Aufrufers**, nicht eine zweite
 * Umsetzung des Tors: gefragt wird mit der Nutzersitzung, welche der verknüpften
 * Fragen sichtbar sind — was zurückkommt, ist sichtbar, alles andere wird
 * genullt. Damit gibt es keine Regel, die neben `can_access_classified`
 * auseinanderlaufen könnte (die Krankheit aus PROJ-130: vier Register, die
 * driften).
 *
 * Warum ein Callback statt eines Supabase-Clients: derselbe Grund wie bei
 * `RpcInvoker` in PROJ-130-δ1 und der Auflösung von PROJ-144-F-9 — Supabases
 * Builder ist ein *thenable* mit generisch überladenen Ketten, ein nachgebautes
 * Interface ist nicht zuweisbar (`TS2345`/`TS2589`). Der Parameter wird
 * abgeleitet, nichts verglichen, und die Regel ist ohne Datenbank prüfbar.
 *
 * **Kein stilles Entkoppeln:** eine genullte Kennung, die der Client beim
 * Speichern zurücksendet, löst die Verknüpfung *nicht*. `update_dd_finding` setzt
 * `coalesce(p_source_dd_question_id, source_dd_question_id)`, solange
 * `p_clear_source` falsch ist — live an der Funktionsdefinition geprüft (Zeile
 * 45/46), nicht angenommen.
 */

/** Liefert die Teilmenge der Kennungen, die der Aufrufer sehen darf. */
export type VisibleQuestionLookup = (
  ids: readonly string[]
) => Promise<readonly string[]>

type WithSource = { source_dd_question_id?: string | null }

/**
 * Nullt `source_dd_question_id` auf jeder Zeile, deren verknüpfte Frage der
 * Aufrufer nicht sehen darf. Trägt keine Zeile eine Verknüpfung, wird gar nicht
 * gefragt — der häufige Fall kostet keine zusätzliche Abfrage.
 */
export async function maskInvisibleSourceQuestions<T extends WithSource>(
  rows: readonly T[],
  lookup: VisibleQuestionLookup
): Promise<T[]> {
  const linked = [
    ...new Set(
      rows
        .map((r) => r.source_dd_question_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ]
  if (linked.length === 0) return [...rows]

  const visible = new Set(await lookup(linked))
  return rows.map((r) =>
    r.source_dd_question_id && !visible.has(r.source_dd_question_id)
      ? { ...r, source_dd_question_id: null }
      : r
  )
}

/** Einzelzeilen-Form für die Antworten von `POST`/`PATCH`. */
export async function maskInvisibleSourceQuestion<T extends WithSource>(
  row: T | null | undefined,
  lookup: VisibleQuestionLookup
): Promise<T | null> {
  if (row == null) return null
  const [masked] = await maskInvisibleSourceQuestions([row], lookup)
  return masked ?? null
}
