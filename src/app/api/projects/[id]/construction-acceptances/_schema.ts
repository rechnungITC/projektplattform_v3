import { z } from "zod"

import {
  CONSTRUCTION_ACCEPTANCE_ATTENDANCE,
  CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLES,
  CONSTRUCTION_ACCEPTANCE_RESULTS,
  CONSTRUCTION_ACCEPTANCE_STATUSES,
} from "@/types/construction-acceptance"

// PROJ-45-γ — geteilte SELECT-Listen und Request-Schemata der Abnahme-Routen.

/**
 * Ausdrückliche Spaltenliste, nie `*` — der Schema-Drift-Wächter vergleicht
 * genau diese Namen gegen das Migrationsschema.
 *
 * Das Gewerk wird zwei Ebenen tief verbunden, weil die Anzeige-Bezeichnung im
 * Mandanten-Katalog liegt und nie nach unten kopiert wird (α-Lock L7).
 */
export const ACCEPTANCE_SELECT =
  "id, tenant_id, project_id, acceptance_number, title, notes, trade_id, " +
  "section_id, scheduled_for, accepted_on, status, reason, warranty_months, " +
  "warranty_end_date, supersedes_acceptance_id, document_label, document_url, " +
  "document_node_id, created_by, recorded_by, created_at, updated_at, " +
  "trade:project_construction_trades(id, trade_id, trade:construction_trades(id, key, label)), " +
  "section:construction_sections(id, label, path)"

export const ACCEPTANCE_EVENT_SELECT =
  "id, tenant_id, acceptance_id, event_type, status_before, status_after, " +
  "reason, actor_id, created_at"

export const ACCEPTANCE_PARTICIPANT_SELECT =
  "id, tenant_id, acceptance_id, stakeholder_id, vendor_id, display_name, " +
  "role_in_acceptance, attendance, sort_order, created_at"

export const ACCEPTANCE_RESERVATION_SELECT =
  "acceptance_id, defect_id, created_at, " +
  "defect:construction_defects(id, defect_number, title, severity, status, due_date, section_id)"

export const idSchema = z.string().uuid()

/** Hausstil für ein Postgres-`date` auf der Leitung. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD erwartet")

/**
 * Ansetzen. HÖCHSTENS ein Anker (D-γ1): Gewerk ODER Abschnitt ODER keiner von
 * beiden — ohne Anker ist es die Gesamtabnahme des Projekts. Beide zugleich
 * wird hier UND in der Datenbank abgewiesen.
 */
export const scheduleAcceptanceSchema = z
  .object({
    scheduled_for: isoDate,
    trade_id: z.string().uuid().nullable().optional(),
    section_id: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(200).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    supersedes_acceptance_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !(v.trade_id && v.section_id), {
    message:
      "Eine Abnahme bezieht sich auf ein Gewerk ODER einen Bauabschnitt — nie auf beides.",
  })

/**
 * Ändern, solange angesetzt. Je optionalem Feld ein ausdrücklicher
 * Leeren-Schalter (PROJ-122-Defektklasse: ein weggelassener Wert heisst
 * „unverändert", nie „leeren").
 */
export const updateAcceptanceSchema = z
  .object({
    scheduled_for: isoDate.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    clear_title: z.literal(true).optional(),
    notes: z.string().trim().max(4000).optional(),
    clear_notes: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })
  .refine((v) => !(v.title !== undefined && v.clear_title), {
    message: "Titel kann nicht gleichzeitig gesetzt und geleert werden.",
  })
  .refine((v) => !(v.notes !== undefined && v.clear_notes), {
    message: "Bemerkung kann nicht gleichzeitig gesetzt und geleert werden.",
  })

const newReservationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  // Pflicht, wie beim Mangel selbst (β-Lock L13): das Gewerk trägt die
  // Zuständigkeit und die Mängelanzeige.
  trade_id: z.string().uuid(),
  severity: z.enum(["gering", "erheblich", "gravierend"]).optional(),
  section_id: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  due_date: isoDate.nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
})

/**
 * Zwei Aktionen auf demselben Endpunkt, wie bei β der Statuswechsel:
 * `absagen` (nur Begründung) und `protokollieren` (Ergebnis + Vorbehalte +
 * Gewährleistung).
 */
export const acceptanceActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("absagen"),
    reason: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("protokollieren"),
    result: z.enum(CONSTRUCTION_ACCEPTANCE_RESULTS),
    accepted_on: isoDate.optional(),
    reason: z.string().trim().max(2000).optional(),
    warranty_months: z.number().int().min(1).max(240).nullable().optional(),
    reservation_defect_ids: z.array(z.string().uuid()).max(500).optional(),
    new_reservations: z.array(newReservationSchema).max(100).optional(),
    accept_despite_open_defects: z.boolean().optional(),
  }),
])

export const participantsSchema = z.object({
  participants: z
    .array(
      z
        .object({
          stakeholder_id: z.string().uuid().nullable().optional(),
          vendor_id: z.string().uuid().nullable().optional(),
          display_name: z.string().trim().min(1).max(160).nullable().optional(),
          role_in_acceptance: z
            .enum(CONSTRUCTION_ACCEPTANCE_PARTICIPANT_ROLES)
            .optional(),
          attendance: z.enum(CONSTRUCTION_ACCEPTANCE_ATTENDANCE).optional(),
        })
        .refine(
          (v) =>
            [v.stakeholder_id, v.vendor_id, v.display_name].filter(Boolean)
              .length === 1,
          {
            message:
              "Jede Teilnehmerzeile trägt genau eine Quelle: Stakeholder, Nachunternehmer oder Name.",
          }
        )
    )
    .max(50),
})

/**
 * Beleg. Entweder eine externe Adresse ODER ein Dokumentknoten — nie beides,
 * und `clear` schliesst beide aus. Die Adressprüfung selbst wird aus PROJ-115
 * WIEDERVERWENDET (`validateExternalUrl`), nicht nachgebaut: die
 * Sicherheitslogik ist die Stelle, an der die Wiederverwendung zählt.
 */
export const acceptanceDocumentSchema = z
  .object({
    label: z.string().trim().max(200).nullable().optional(),
    url: z.string().trim().max(2000).nullable().optional(),
    document_node_id: z.string().uuid().nullable().optional(),
    clear: z.literal(true).optional(),
  })
  .refine((v) => !(v.url && v.document_node_id), {
    message: "Ein Beleg ist entweder eine Adresse oder ein Dokument — nie beides.",
  })
  .refine((v) => !(v.clear && (v.url || v.document_node_id)), {
    message: "Entfernen und Setzen schliessen sich aus.",
  })
  .refine((v) => Boolean(v.clear || v.url || v.document_node_id), {
    message: "Es ist nichts anzuhängen.",
  })

export const acceptanceStatusFilterSchema = z.enum(
  CONSTRUCTION_ACCEPTANCE_STATUSES
)

/**
 * Bildet jeden Postgres-Fehler der Abnahme-Funktionen auf die α/β-förmige
 * HTTP-Antwort ab. An EINER Stelle, damit die Mutations-Routen nicht driften:
 *   42501 Rollenabweisung / Einfrier-Wächter    -> 403
 *   P0001 Zustands-/Doppel-/Vorbehalts-Konflikt -> 409
 *   23514 Bedingung verletzt                    -> 422
 *   22023 unbekannter Wert                      -> 422
 *   23503 hängender Verweis                     -> 422
 *   23505 Doppeleintrag                         -> 409
 *   P0002 nicht gefunden                        -> 404
 *
 * `P0001` ist gegenüber β NEU und trägt hier die drei benennenden Absagen
 * („bereits eine Abnahme angesetzt", „nur eine angesetzte Abnahme kann …",
 * „offene Mängel ohne ausdrückliche Bestätigung"). β kannte den Code nicht und
 * hätte sie auf 500 abgebildet.
 */
export function acceptanceRpcErrorStatus(code: string | undefined): {
  code: string
  status: number
} | null {
  switch (code) {
    case "42501":
      return { code: "forbidden", status: 403 }
    case "P0001":
      return { code: "conflict", status: 409 }
    case "23514":
      return { code: "constraint_violation", status: 422 }
    case "22023":
      return { code: "invalid_value", status: 422 }
    case "23503":
      return { code: "invalid_reference", status: 422 }
    case "23505":
      return { code: "duplicate_key", status: 409 }
    case "P0002":
      return { code: "not_found", status: 404 }
    default:
      return null
  }
}
