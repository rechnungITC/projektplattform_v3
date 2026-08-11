/**
 * PROJ-130-γ3 — das Objektarten-Register darf nicht wieder driften.
 *
 * Vorgeschichte: Union und Array waren zwei handgepflegte Kopien, das Array war
 * als `readonly AuditEntityType[]` typisiert und verlor damit den Tupel-
 * Charakter. Ein Wert in der Union ohne Array-Eintrag kompilierte sauber und
 * wurde dann still mit 400 abgelehnt. Beide Kopien standen bei 15 Einträgen,
 * während der DB-CHECK 88 zuließ.
 *
 * Die Union wird jetzt aus dem Array ABGELEITET, Union-vs-Array kann also nicht
 * mehr auseinanderlaufen. Was TypeScript NICHT prüfen kann, ist die
 * Übereinstimmung mit der Datenbank — genau das prüft dieser Test gegen einen
 * eingefrorenen Abzug des CHECK-Constraints. Läuft er rot, ist entweder eine
 * Migration ohne TS-Nachzug gelandet oder umgekehrt.
 *
 * Abzug erzeugt am 2026-08-11 aus:
 *   select m[1] from pg_constraint c,
 *     lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text','g') m
 *   where c.conname = 'audit_log_entity_type_check';
 */

import { describe, expect, it } from "vitest"

import {
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  type AuditEntityType,
} from "./audit"

/** Eingefrorener Abzug von `audit_log_entity_type_check` (88 Werte). */
const DB_CHECK_SNAPSHOT = [
  "audit_reader_grants", "budget_categories", "budget_items", "budget_postings",
  "committee_meeting_attendees", "committee_meeting_documents",
  "committee_meeting_outcomes", "committee_meetings", "committee_members",
  "committee_templates", "committees", "communication_matrix_entries",
  "communication_outbox", "communication_templates", "compliance_tags",
  "context_sources", "dd_findings", "dd_questions", "dd_streams",
  "decision_approval_state", "decisions", "deliverable_approval_stages",
  "deliverable_approvals", "deliverable_documents", "deliverables",
  "dependencies", "document_tree_nodes", "documents",
  "external_document_links", "locations", "ma_advisor_profiles",
  "ma_clearance_approval_policies", "ma_clearance_grant_requests",
  "ma_clearance_profiles", "ma_confidentiality_clearances",
  "ma_nda_assignments", "ma_ndas", "ma_project_profiles", "ma_stage_gates",
  "ma_valuations", "mcp_access_tokens", "milestones", "open_items",
  "organization_imports", "organization_units", "phases", "project_goals",
  "project_skills", "projects", "raci_assignments", "releases",
  "report_snapshots", "resources", "risk_categories", "risk_links", "risks",
  "role_rates", "skill_examples", "skill_knowledge_links", "skill_versions",
  "skills", "spa_issues", "sprints", "stakeholder_coaching_recommendations",
  "stakeholder_interaction_participants", "stakeholder_interactions",
  "stakeholders", "tenant_ai_cost_caps", "tenant_ai_keys",
  "tenant_ai_provider_priority", "tenant_ai_providers", "tenant_memberships",
  "tenant_method_overrides", "tenant_project_type_overrides", "tenant_secrets",
  "tenant_settings", "tenants", "vendor_documents", "vendor_evaluations",
  "vendor_invoices", "vendor_project_assignments", "vendors",
  "work_item_cost_lines", "work_item_documents", "work_item_resources",
  "work_items", "workstream_phases", "workstreams",
] as const

describe("AUDIT_ENTITY_TYPES", () => {
  it("deckt sich vollständig mit dem DB-CHECK", () => {
    expect([...AUDIT_ENTITY_TYPES].sort()).toEqual([...DB_CHECK_SNAPSHOT].sort())
  })

  it("hat für jede Objektart ein deutsches Label", () => {
    const missing = AUDIT_ENTITY_TYPES.filter(
      (t) => !AUDIT_ENTITY_LABELS[t]?.trim()
    )
    expect(missing).toEqual([])
  })

  it("hat keine Labels für unbekannte Objektarten", () => {
    const known = new Set<string>(AUDIT_ENTITY_TYPES)
    expect(Object.keys(AUDIT_ENTITY_LABELS).filter((k) => !known.has(k))).toEqual(
      []
    )
  })

  it("enthält keine Duplikate", () => {
    expect(new Set(AUDIT_ENTITY_TYPES).size).toBe(AUDIT_ENTITY_TYPES.length)
  })

  it("ist als Tupel typisiert — die Union ist abgeleitet, nicht deklariert", () => {
    // Kompiliert nur, wenn der `as const`-Tupel-Charakter erhalten ist: eine
    // Literal-Zuweisung an den Union-Typ muss aus dem Array stammen können.
    const first: AuditEntityType = AUDIT_ENTITY_TYPES[0]
    expect(typeof first).toBe("string")
    // Und ein erfundener Wert darf NICHT zuweisbar sein:
    // @ts-expect-error — kein Mitglied des Registers
    const bogus: AuditEntityType = "definitely_not_a_table"
    expect(bogus).toBe("definitely_not_a_table")
  })

  it("deckt die Objektarten ab, die PROJ-130 neu in den Trail gebracht hat", () => {
    for (const t of [
      "audit_reader_grants", // γ2
      "context_sources", // β
      "mcp_access_tokens", // β
      "tenant_secrets", // β
      "ma_project_profiles", // α (die entschärfte CHECK-Bombe)
      "tenant_memberships", // α (Rollenwechsel)
    ] as const) {
      expect(AUDIT_ENTITY_TYPES).toContain(t)
      expect(AUDIT_ENTITY_LABELS[t]).toBeTruthy()
    }
  })
})
