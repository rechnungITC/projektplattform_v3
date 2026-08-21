/**
 * PROJ-45-β — was die Bedienfläche anbieten und senden darf. Reine Ableitungen,
 * kein I/O, damit sie ohne Rendern prüfbar sind.
 *
 * Zwei Dinge stehen hier bewusst NICHT drin:
 *
 *  - **die Rechteregel.** Wer ändern, fertigmelden, prüfen oder verwerfen darf,
 *    entscheidet ausschliesslich `transition_construction_defect_status` bzw.
 *    `update_construction_defect` (Q-β1: EINE prüfbare Stelle). Die Oberfläche
 *    fragt dafür das bestehende Hausprädikat `useProjectAccess(…,
 *    "manage_members")` ab — `is_tenant_admin OR is_project_lead`, deckungsgleich
 *    mit der Funktionsprüfung — und blendet nur Bedienelemente aus. Sie
 *    formuliert die Regel nicht neu.
 *  - **die Überfälligkeit.** Die lebt in `./defects` (SQL-Zwilling, D-β8).
 *
 * Was hier steht, ist der Zustandsautomat als Angebots-Spiegel: ohne ihn müsste
 * die Fläche alle sechs Handlungen anbieten und den 422 abwarten. Der Spiegel ist
 * eine bewusste Abweichung (D-β10) und mit einer Testtabelle gepinnt, die die
 * Zeilen 597–618 der Migration 20260818104358 wörtlich nachzeichnet.
 */

import type {
  ConstructionDefect,
  ConstructionDefectAction,
  ConstructionDefectStatus,
} from "@/types/construction-defect"

import type { UpdateDefectPayload } from "./api"

export interface DefectTransition {
  /** Aus diesen Zuständen ist die Handlung erlaubt. */
  from: readonly ConstructionDefectStatus[]
  /** Zustand danach — nur für die Bestätigungstexte der Oberfläche. */
  to: ConstructionDefectStatus
  /** Die Datenbank weist die Handlung ohne Begründung ab (23514). */
  reasonRequired: boolean
}

/**
 * Spiegel des `case p_action`-Blocks in
 * `transition_construction_defect_status`. `fertigmelden` ist auch direkt aus
 * `offen` erlaubt (D-β7): ein kleiner, sofort behobener Mangel soll nicht durch
 * einen Pflicht-Zwischenschritt laufen.
 */
export const DEFECT_TRANSITIONS: Record<ConstructionDefectAction, DefectTransition> = {
  in_arbeit: { from: ["offen"], to: "in_bearbeitung", reasonRequired: false },
  fertigmelden: {
    from: ["offen", "in_bearbeitung"],
    to: "erledigt",
    reasonRequired: false,
  },
  pruefen: { from: ["erledigt"], to: "geprueft", reasonRequired: false },
  zurueckweisen: { from: ["erledigt"], to: "in_bearbeitung", reasonRequired: true },
  verwerfen: {
    from: ["offen", "in_bearbeitung", "erledigt"],
    to: "verworfen",
    reasonRequired: true,
  },
  wieder_aufnehmen: { from: ["verworfen"], to: "offen", reasonRequired: false },
}

/** Reihenfolge, in der die Fläche die Handlungen anbietet. */
const ACTION_ORDER: readonly ConstructionDefectAction[] = [
  "in_arbeit",
  "fertigmelden",
  "pruefen",
  "zurueckweisen",
  "wieder_aufnehmen",
  "verwerfen",
]

/** Die aus diesem Zustand überhaupt möglichen Handlungen, in Anzeigereihenfolge. */
export function availableDefectActions(
  status: ConstructionDefectStatus | string | null | undefined
): ConstructionDefectAction[] {
  return ACTION_ORDER.filter((action) =>
    (DEFECT_TRANSITIONS[action].from as readonly string[]).includes(status ?? "")
  )
}

/** Braucht die Handlung eine Pflichtbegründung? (AC-45β.8 / AC-45β.11) */
export function defectActionNeedsReason(action: ConstructionDefectAction): boolean {
  return DEFECT_TRANSITIONS[action].reasonRequired
}

/**
 * Warum die Abnahme für **diesen** Aufrufer nicht angeboten wird — oder `null`,
 * wenn sie es wird.
 *
 * Das Vier-Augen-Tor (AC-45β.10) sitzt in der Funktion und weist mit `42501` ab;
 * hier wird es nur *erklärt*, damit die Oberfläche keine Sackgasse anbietet. Die
 * Prüfung liest dasselbe Feld wie die Datenbank (`reported_done_by`), das bei
 * JEDER Fertigmeldung neu gesetzt wird — deshalb stimmt die Erklärung auch in
 * Runde n nach mehrfacher Rückweisung.
 */
export function describeReviewBlock(
  defect: Pick<ConstructionDefect, "status" | "reported_done_by">,
  currentUserId: string | null | undefined
): string | null {
  if (defect.status !== "erledigt") return null
  if (!defect.reported_done_by) {
    return "Der Mangel wurde nie fertiggemeldet — eine Abnahme ist noch nicht möglich."
  }
  if (currentUserId && defect.reported_done_by === currentUserId) {
    return (
      "Sie haben diesen Mangel fertiggemeldet. Die Abnahme braucht nach dem " +
      "Vier-Augen-Prinzip eine zweite berechtigte Person — es gibt dafür " +
      "bewusst keinen Umgehungsweg. Ist die Projektleitung gleichzeitig die " +
      "einzige Mandanten-Administration, muss eine zweite Projektleitung " +
      "benannt werden."
    )
  }
  return null
}

/** Die Handlungen, die dieser Aufrufer wirklich ausführen kann. */
export function offeredDefectActions(
  defect: Pick<ConstructionDefect, "status" | "reported_done_by">,
  currentUserId: string | null | undefined
): ConstructionDefectAction[] {
  const blocked = describeReviewBlock(defect, currentUserId) !== null
  return availableDefectActions(defect.status).filter(
    (action) => !(action === "pruefen" && blocked)
  )
}

// ── Änderungs-Nutzlast: setzen, unverändert lassen, ausdrücklich leeren ─────

/** Was die Maske hält. Leerer String = das Feld ist in der Maske leer. */
export interface DefectDraft {
  title: string
  trade_id: string
  severity: ConstructionDefect["severity"]
  description: string
  section_id: string
  due_date: string
  responsible_user_id: string
  vendor_id: string
}

/** Füllt die Maske aus einem bestehenden Mangel. */
export function draftFromDefect(defect: ConstructionDefect): DefectDraft {
  return {
    title: defect.title,
    trade_id: defect.trade_id,
    severity: defect.severity,
    description: defect.description ?? "",
    section_id: defect.section_id ?? "",
    due_date: defect.due_date ?? "",
    responsible_user_id: defect.responsible_user_id ?? "",
    vendor_id: defect.vendor_id ?? "",
  }
}

/**
 * Baut die PATCH-Nutzlast als **Differenz** zum Ausgangszustand.
 *
 * Der Kern ist die dritte Möglichkeit: die Änderungs-Funktion kennt neben
 * „setzen" und „unverändert" ausdrückliche Leeren-Schalter, weil ein
 * weggelassener Wert dort „unverändert" bedeutet. PROJ-122 hat genau dort einen
 * Defekt ausgeliefert — eine zurückgezogene Position überlebte stillschweigend,
 * weil „weglassen" als „behalten" gelesen wurde und die Maske keinen anderen Weg
 * hatte. Ein in der Maske geleertes Feld wird deshalb hier zu `clear_*: true`,
 * nicht zu einem weggelassenen Feld und nicht zu einem Leerstring.
 *
 * `trade_id` hat keinen Schalter: das Gewerk bleibt Pflicht (L13), es ist
 * umhängbar, aber nicht leerbar.
 *
 * Gibt `null` zurück, wenn sich nichts geändert hat — dann darf gar nicht
 * gesendet werden, weil die Funktion einen leeren Rumpf mit 422 abweist.
 */
export function buildDefectUpdatePayload(
  original: ConstructionDefect,
  draft: DefectDraft
): UpdateDefectPayload | null {
  const before = draftFromDefect(original)
  const payload: UpdateDefectPayload = {}

  const title = draft.title.trim()
  if (title.length > 0 && title !== before.title) payload.title = title
  if (draft.trade_id.length > 0 && draft.trade_id !== before.trade_id) {
    payload.trade_id = draft.trade_id
  }
  if (draft.severity !== before.severity) payload.severity = draft.severity

  const description = draft.description.trim()
  if (description !== before.description) {
    if (description.length === 0) payload.clear_description = true
    else payload.description = description
  }

  if (draft.section_id !== before.section_id) {
    if (draft.section_id.length === 0) payload.clear_section = true
    else payload.section_id = draft.section_id
  }

  if (draft.due_date !== before.due_date) {
    if (draft.due_date.length === 0) payload.clear_due_date = true
    else payload.due_date = draft.due_date
  }

  if (draft.responsible_user_id !== before.responsible_user_id) {
    if (draft.responsible_user_id.length === 0) payload.clear_responsible = true
    else payload.responsible_user_id = draft.responsible_user_id
  }

  if (draft.vendor_id !== before.vendor_id) {
    if (draft.vendor_id.length === 0) payload.clear_vendor = true
    else payload.vendor_id = draft.vendor_id
  }

  return Object.keys(payload).length > 0 ? payload : null
}
