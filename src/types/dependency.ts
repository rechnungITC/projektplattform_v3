/**
 * Kantentypen des Netzablaufplans — die **eine** Autorität.
 *
 * Vor PROJ-155-β.1 stand die Liste dreimal im Repo: als Zod-Enum in
 * `dependencies/_schema.ts`, als Union in `gantt-view.tsx:78` und als
 * Union **plus** hartkodiertes Array in `dependencies-tab-client.tsx:76/358`.
 * Drei Kopien und keine Beschriftung: die Oberfläche zeigte überall die
 * Kürzel `FS`/`SS`/`FF`/`SF`, obwohl sie für niemanden ausserhalb der
 * Projektsteuerung lesbar sind.
 *
 * Beides ist hier zusammengeführt. Das Zod-Enum leitet sich aus diesem Tupel
 * ab, damit ein fünfter Typ nicht an einer Stelle durchrutschen kann.
 */
export const DEPENDENCY_CONSTRAINT_TYPES = ["FS", "SS", "FF", "SF"] as const

export type DependencyConstraintType =
  (typeof DEPENDENCY_CONSTRAINT_TYPES)[number]

/**
 * Deutsche Klartext-Beschriftung. Das Kürzel bleibt in Klammern stehen: wer
 * die Fachsprache kennt, sucht danach, und wer sie nicht kennt, liest den
 * ausgeschriebenen Teil.
 */
export const DEPENDENCY_CONSTRAINT_LABELS: Record<
  DependencyConstraintType,
  string
> = {
  FS: "Ende → Start (FS)",
  SS: "Start → Start (SS)",
  FF: "Ende → Ende (FF)",
  SF: "Start → Ende (SF)",
}

/** Ein Satz je Typ, für die Auswahl. */
export const DEPENDENCY_CONSTRAINT_HINTS: Record<
  DependencyConstraintType,
  string
> = {
  FS: "Der Nachfolger beginnt, wenn der Vorgänger fertig ist. Der Normalfall.",
  SS: "Beide beginnen gemeinsam.",
  FF: "Beide enden gemeinsam.",
  SF: "Der Nachfolger endet, wenn der Vorgänger beginnt. Selten.",
}

/**
 * Trägt die Kante eine Abweichung vom Normalfall?
 *
 * Nur dann bekommt der Pfeil im Diagramm ein Abzeichen. `FS` ohne Abstand
 * bleibt unbeschriftet — sonst wäre jedes Diagramm zugepflastert und die
 * Kennzeichnung sagte nichts mehr aus.
 */
export function isNonDefaultConstraint(
  constraintType: string,
  lagDays: number | null | undefined,
): boolean {
  return constraintType !== "FS" || (lagDays ?? 0) !== 0
}

/**
 * Kurzform für das Abzeichen am Pfeil: `SS`, `FS+3`, `FF-2`.
 * Gibt `null` zurück, wenn nichts zu zeigen ist.
 */
export function constraintBadge(
  constraintType: string,
  lagDays: number | null | undefined,
): string | null {
  if (!isNonDefaultConstraint(constraintType, lagDays)) return null
  const lag = lagDays ?? 0
  if (lag === 0) return constraintType
  return `${constraintType}${lag > 0 ? "+" : ""}${lag}`
}

/** Grenzen für den Abstand — dieselben wie bei `work_item_links` (PROJ-27). */
export const DEPENDENCY_LAG_MIN = -2000
export const DEPENDENCY_LAG_MAX = 2000
