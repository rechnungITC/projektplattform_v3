/**
 * PROJ-45-γ — Abnahmen (construction acceptances).
 *
 * Eine Abnahme ist der Punkt, an dem Bauleistung rechtlich übergeht: sie setzt
 * die Gewährleistungsfrist in Gang, kehrt die Beweislast um und lässt
 * Vorbehalte verfallen, die nicht BEI der Abnahme erklärt werden.
 *
 * Schlüsselwerte sind deutsch, wie in α (`gruen/gelb/rot`) und β
 * (`offen/in_bearbeitung/...`); Anzeigetexte kommen aus den Zuordnungen unten,
 * nie aus der Datenbank.
 */

/**
 * Zweistufig (L18): `angesetzt` ist der einzige offene Zustand, die vier
 * übrigen sind abschliessend. Eine verweigerte Abnahme wird NICHT wieder
 * geöffnet — die Nachabnahme ist ein neuer Datensatz mit Verweis (L19).
 */
export const CONSTRUCTION_ACCEPTANCE_STATUSES = [
  "angesetzt",
  "abgenommen",
  "abgenommen_unter_vorbehalt",
  "verweigert",
  "abgesagt",
] as const
export type ConstructionAcceptanceStatus =
  (typeof CONSTRUCTION_ACCEPTANCE_STATUSES)[number]

/** Die drei Ergebnisse, die beim Protokollieren gesetzt werden können. */
export const CONSTRUCTION_ACCEPTANCE_RESULTS = [
  "abgenommen",
  "abgenommen_unter_vorbehalt",
  "verweigert",
] as const
export type ConstructionAcceptanceResult =
  (typeof CONSTRUCTION_ACCEPTANCE_RESULTS)[number]

export const CONSTRUCTION_ACCEPTANCE_STATUS_LABELS: Record<
  ConstructionAcceptanceStatus,
  string
> = {
  angesetzt: "Angesetzt",
  abgenommen: "Abgenommen",
  abgenommen_unter_vorbehalt: "Abgenommen unter Vorbehalt",
  verweigert: "Verweigert",
  abgesagt: "Abgesagt",
}

export const CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLES = [
  "auftraggeber",
  "auftragnehmer",
  "bauleitung",
  "sachverstaendiger",
  "sonstige",
] as const
export type ConstructionAcceptanceParticipantRole =
  (typeof CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLES)[number]

export const CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLE_LABELS: Record<
  ConstructionAcceptanceParticipantRole,
  string
> = {
  auftraggeber: "Auftraggeber",
  auftragnehmer: "Auftragnehmer",
  bauleitung: "Bauleitung",
  sachverstaendiger: "Sachverständiger",
  sonstige: "Sonstige",
}

export const CONSTRUCTION_ACCEPTANCE_ATTENDANCE = ["anwesend", "abwesend"] as const
export type ConstructionAcceptanceAttendance =
  (typeof CONSTRUCTION_ACCEPTANCE_ATTENDANCE)[number]

export const CONSTRUCTION_ACCEPTANCE_EVENT_TYPES = [
  "angesetzt",
  "verschoben",
  "abgesagt",
  "protokolliert",
] as const
export type ConstructionAcceptanceEventType =
  (typeof CONSTRUCTION_ACCEPTANCE_EVENT_TYPES)[number]

export const CONSTRUCTION_ACCEPTANCE_EVENT_LABELS: Record<
  ConstructionAcceptanceEventType,
  string
> = {
  angesetzt: "Angesetzt",
  verschoben: "Verschoben",
  abgesagt: "Abgesagt",
  protokolliert: "Protokolliert",
}

/**
 * Gewährleistungsdauern zur Auswahl (L21). Die Werte sind Vorschläge, keine
 * Rechtsberatung — deshalb ist „frei" ausdrücklich dabei und nichts ist
 * vorbelegt.
 */
export const CONSTRUCTION_WARRANTY_PRESETS = [
  { months: 48, label: "VOB/B — 4 Jahre" },
  { months: 60, label: "BGB — 5 Jahre" },
] as const

export interface ConstructionAcceptance {
  id: string
  tenant_id: string
  project_id: string
  acceptance_number: number
  title: string | null
  notes: string | null
  /** Höchstens einer der beiden ist gesetzt; keiner = Gesamtabnahme (D-γ1). */
  trade_id: string | null
  section_id: string | null
  scheduled_for: string
  accepted_on: string | null
  status: ConstructionAcceptanceStatus
  reason: string | null
  warranty_months: number | null
  /** Beim Protokollieren FESTGESCHRIEBEN, danach unveränderlich (Q-γ4). */
  warranty_end_date: string | null
  supersedes_acceptance_id: string | null
  document_label: string | null
  document_url: string | null
  document_node_id: string | null
  created_by: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
  trade?: {
    id: string
    trade_id: string
    trade?: { id: string; key: string; label: string } | null
  } | null
  section?: { id: string; label: string; path: string | null } | null
}

export interface ConstructionAcceptanceEvent {
  id: string
  tenant_id: string
  acceptance_id: string
  event_type: ConstructionAcceptanceEventType
  status_before: ConstructionAcceptanceStatus | null
  status_after: ConstructionAcceptanceStatus
  reason: string | null
  actor_id: string | null
  created_at: string
}

export interface ConstructionAcceptanceParticipant {
  id: string
  tenant_id: string
  acceptance_id: string
  stakeholder_id: string | null
  vendor_id: string | null
  /** Immer gesetzt — der Name, wie er ZUM ZEITPUNKT der Abnahme galt. */
  display_name: string
  role_in_acceptance: ConstructionAcceptanceParticipantRole
  attendance: ConstructionAcceptanceAttendance
  sort_order: number
  created_at: string
}

/** Ein Vorbehalt ist ein VERWEIS auf einen β-Mangel, nie eine Kopie (L20). */
export interface ConstructionAcceptanceReservation {
  acceptance_id: string
  defect_id: string
  created_at: string
  defect?: {
    id: string
    defect_number: number
    title: string
    severity: string
    status: string
    due_date: string | null
    section_id: string | null
  } | null
}

export interface ConstructionAcceptanceSummary {
  total: number
  scheduled: number
  accepted: number
  accepted_with_reservation: number
  refused: number
  cancelled: number
  next_scheduled_for: string | null
  by_trade: Array<{
    trade_id: string
    total: number
    scheduled: number
    accepted: number
    refused: number
    warranty_end_date: string | null
  }>
}

/** Eingabe für einen neuen Vorbehalt, der zu einem echten β-Mangel wird. */
export interface ConstructionAcceptanceNewReservation {
  title: string
  trade_id: string
  severity?: string
  section_id?: string | null
  description?: string | null
  due_date?: string | null
  vendor_id?: string | null
}

/**
 * Nur `angesetzt` ist offen. Alles andere ist abschliessend — die Oberfläche
 * leitet daraus ab, ob Ändern, Absagen und Protokollieren überhaupt angeboten
 * werden (der Server entscheidet ohnehin nochmals).
 */
export function isAcceptanceOpen(status: ConstructionAcceptanceStatus): boolean {
  return status === "angesetzt"
}

/** Trägt diese Abnahme eine laufende Gewährleistungsfrist? */
export function hasWarranty(a: ConstructionAcceptance): boolean {
  return a.warranty_end_date !== null
}

/** Bezugsart in Klartext — auch für den ankerlosen Fall (Gesamtabnahme). */
export function acceptanceSubjectKind(
  a: Pick<ConstructionAcceptance, "trade_id" | "section_id">
): "gewerk" | "abschnitt" | "gesamt" {
  if (a.trade_id) return "gewerk"
  if (a.section_id) return "abschnitt"
  return "gesamt"
}
