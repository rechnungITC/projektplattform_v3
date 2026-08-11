/**
 * PROJ-10 / PROJ-130 — audit log types.
 *
 * Audit rows are written by Postgres triggers and only ever read by users
 * (via `/api/audit/...`). Two trigger paths exist since PROJ-130-β:
 * `record_audit_changes` writes one row per changed field, and
 * `record_audit_lifecycle` writes one row per created/deleted object using the
 * sentinels in `src/lib/audit/lifecycle.ts`.
 *
 * PROJ-130-γ3 — WHY THE UNION IS DERIVED, NOT DECLARED
 *
 * This list used to be two hand-maintained copies: a `AuditEntityType` union
 * and a `AUDIT_ENTITY_TYPES` array annotated `readonly AuditEntityType[]`. That
 * annotation discarded the `as const` tuple, so a value added to the union but
 * forgotten in the array still compiled — and was then silently rejected with
 * 400 by every `z.enum(AUDIT_ENTITY_TYPES)` and missing from the filter
 * dropdown. Both copies had drifted to 15 entries while the database CHECK
 * admitted 88; roughly 5/6 of all audited object types were unreachable
 * through the API.
 *
 * The union is now DERIVED from the array, so the two cannot disagree by
 * construction. `AUDIT_ENTITY_LABELS` is a total `Record`, so a new array entry
 * fails to compile until it has a German label. What remains unenforced at
 * compile time is agreement with the database CHECK — that is asserted in
 * `audit.test.ts` against a snapshot of the constraint, and structurally owned
 * by the drift guard from the PROJ-130 tech design.
 */

export const AUDIT_ENTITY_TYPES = [
  "audit_reader_grants",
  "budget_categories",
  "budget_items",
  "budget_postings",
  "committee_meeting_attendees",
  "committee_meeting_documents",
  "committee_meeting_outcomes",
  "committee_meetings",
  "committee_members",
  "committee_templates",
  "committees",
  "communication_matrix_entries",
  "communication_outbox",
  "communication_templates",
  "compliance_tags",
  "context_sources",
  "dd_findings",
  "dd_questions",
  "dd_streams",
  "decision_approval_state",
  "decisions",
  "deliverable_approval_stages",
  "deliverable_approvals",
  "deliverable_documents",
  "deliverables",
  "dependencies",
  "document_tree_nodes",
  "documents",
  "external_document_links",
  "locations",
  "ma_advisor_profiles",
  "ma_clearance_approval_policies",
  "ma_clearance_grant_requests",
  "ma_clearance_profiles",
  "ma_confidentiality_clearances",
  "ma_nda_assignments",
  "ma_ndas",
  "ma_project_profiles",
  "ma_stage_gates",
  "ma_valuations",
  "mcp_access_tokens",
  "milestones",
  "open_items",
  "organization_imports",
  "organization_units",
  "phases",
  "project_goals",
  "project_skills",
  "projects",
  "raci_assignments",
  "releases",
  "report_snapshots",
  "resources",
  "risk_categories",
  "risk_links",
  "risks",
  "role_rates",
  "skill_examples",
  "skill_knowledge_links",
  "skill_versions",
  "skills",
  "spa_issues",
  "sprints",
  "stakeholder_coaching_recommendations",
  "stakeholder_interaction_participants",
  "stakeholder_interactions",
  "stakeholders",
  "tenant_ai_cost_caps",
  "tenant_ai_keys",
  "tenant_ai_provider_priority",
  "tenant_ai_providers",
  "tenant_memberships",
  "tenant_method_overrides",
  "tenant_project_type_overrides",
  "tenant_secrets",
  "tenant_settings",
  "tenants",
  "vendor_documents",
  "vendor_evaluations",
  "vendor_invoices",
  "vendor_project_assignments",
  "vendors",
  "work_item_cost_lines",
  "work_item_documents",
  "work_item_resources",
  "work_items",
  "workstream_phases",
  "workstreams",
] as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

/**
 * German display labels. Total `Record` on purpose: a new entity type cannot be
 * added above without also getting a label here.
 */
export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  audit_reader_grants: "Revisions-Freigabe",
  budget_categories: "Budget-Kategorie",
  budget_items: "Budget-Posten",
  budget_postings: "Budget-Buchung",
  committee_meeting_attendees: "Gremien-Teilnehmer",
  committee_meeting_documents: "Gremien-Dokument",
  committee_meeting_outcomes: "Gremien-Ergebnis",
  committee_meetings: "Gremien-Termin",
  committee_members: "Gremien-Besetzung",
  committee_templates: "Gremien-Vorlage",
  committees: "Gremium",
  communication_matrix_entries: "Kommunikationsmatrix-Eintrag",
  communication_outbox: "Kommunikations-Ausgang",
  communication_templates: "Kommunikations-Vorlage",
  compliance_tags: "Compliance-Tag",
  context_sources: "Kontextquelle",
  dd_findings: "DD-Finding",
  dd_questions: "DD-Frage",
  dd_streams: "DD-Stream",
  decision_approval_state: "Entscheidungs-Freigabestand",
  decisions: "Entscheidung",
  deliverable_approval_stages: "Deliverable-Freigabestufe",
  deliverable_approvals: "Deliverable-Freigabe",
  deliverable_documents: "Deliverable-Dokument",
  deliverables: "Deliverable",
  dependencies: "Abhängigkeit",
  document_tree_nodes: "Dokumentenknoten",
  documents: "Dokument",
  external_document_links: "Externer Dokumentenlink",
  locations: "Standort",
  ma_advisor_profiles: "Berater-Profil",
  ma_clearance_approval_policies: "Freischaltungs-Richtlinie",
  ma_clearance_grant_requests: "Freischaltungs-Antrag",
  ma_clearance_profiles: "Berechtigungsprofil",
  ma_confidentiality_clearances: "Vertraulichkeits-Freischaltung",
  ma_nda_assignments: "NDA-Zuordnung",
  ma_ndas: "NDA",
  ma_project_profiles: "M&A-Grundlage",
  ma_stage_gates: "Stage-Gate",
  ma_valuations: "Bewertung",
  mcp_access_tokens: "MCP-Zugangstoken",
  milestones: "Meilenstein",
  open_items: "Offener Punkt",
  organization_imports: "Organisations-Import",
  organization_units: "Organisationseinheit",
  phases: "Phase",
  project_goals: "Projektziel",
  project_skills: "Projekt-Skill",
  projects: "Projekt",
  raci_assignments: "RACI-Zuordnung",
  releases: "Release",
  report_snapshots: "Report-Snapshot",
  resources: "Ressource",
  risk_categories: "Risikokategorie",
  risk_links: "Risiko-Verknüpfung",
  risks: "Risiko",
  role_rates: "Tagessatz",
  skill_examples: "Skill-Beispiel",
  skill_knowledge_links: "Skill-Wissensquelle",
  skill_versions: "Skill-Version",
  skills: "Skill",
  spa_issues: "SPA-Issue",
  sprints: "Sprint",
  stakeholder_coaching_recommendations: "Coaching-Empfehlung",
  stakeholder_interaction_participants: "Interaktions-Teilnehmer",
  stakeholder_interactions: "Stakeholder-Interaktion",
  stakeholders: "Stakeholder",
  tenant_ai_cost_caps: "KI-Kostengrenze",
  tenant_ai_keys: "KI-Schlüssel",
  tenant_ai_provider_priority: "KI-Provider-Priorität",
  tenant_ai_providers: "KI-Provider",
  tenant_memberships: "Mandanten-Mitgliedschaft",
  tenant_method_overrides: "Methoden-Override",
  tenant_project_type_overrides: "Projekttyp-Override",
  tenant_secrets: "Mandanten-Geheimnis",
  tenant_settings: "Mandanten-Einstellungen",
  tenants: "Mandant",
  vendor_documents: "Lieferanten-Dokument",
  vendor_evaluations: "Lieferanten-Bewertung",
  vendor_invoices: "Lieferanten-Rechnung",
  vendor_project_assignments: "Lieferanten-Zuordnung",
  vendors: "Lieferant",
  work_item_cost_lines: "Kostenzeile",
  work_item_documents: "Work-Item-Dokument",
  work_item_resources: "Work-Item-Ressource",
  work_items: "Work Item",
  workstream_phases: "Workstream-Phase",
  workstreams: "Workstream",
}

export interface AuditLogEntry {
  id: string
  tenant_id: string
  entity_type: AuditEntityType
  entity_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  actor_user_id: string | null
  changed_at: string
  change_reason: string | null
}
