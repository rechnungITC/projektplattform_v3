/**
 * PROJ-57 — Participant linking types.
 *
 * Source of truth for the four roles a single human can occupy on
 * a project, plus the rate-source classification for resources.
 *
 * Glossary:
 *   - Tenant Member: hat einen Login im Workspace (auth.users x tenant_memberships)
 *   - Project Member: hat eine Berechtigung im Projekt (project_memberships)
 *   - Stakeholder: fachlich relevante Person/Organisation im Projekt
 *   - Resource: plannbare Kapazität (Kosten + Allokation)
 */

/**
 * Stable identity for a participant row. Different IDs may resolve
 * to the same human (e.g. internal user + their stakeholder + their
 * resource), but the aggregator dedupes them on a best-effort basis
 * via `linked_user_id` joins.
 */
export interface ParticipantLink {
  /** Deduped identity. Either user_id (preferred) or
   *  stable hash of stakeholder/resource id when no user link. */
  identity_key: string
  /** Display name, picked from the most-trustworthy source in the
   *  chain (profile → stakeholder → resource). */
  display_name: string
  /** Email if known via tenant_memberships/profiles. */
  email: string | null

  // --- Roles ---
  is_tenant_member: boolean
  is_project_member: boolean
  project_role: "lead" | "editor" | "viewer" | null
  is_stakeholder: boolean
  is_resource: boolean

  // --- Cross-reference IDs (nullable when role not held). ---
  user_id: string | null
  project_membership_id: string | null
  stakeholder_id: string | null
  resource_id: string | null

  // --- Rate source classification (resource only). ---
  rate_source: ParticipantRateSource

  /** Human-readable summary of "what's missing to make this row
   *  cleanly operable" — drives the FE assistant. */
  link_warnings: string[]
}

export type ParticipantRateSource =
  | { kind: "none" }
  | { kind: "role_rate"; role_key: string }
  | { kind: "override"; amount: number; currency: string }
  | { kind: "unresolved"; reason: string }

export interface ProjectParticipantLinksSnapshot {
  project_id: string
  generated_at: string
  participants: ParticipantLink[]
  counts: {
    total: number
    members: number
    stakeholders: number
    resources: number
    fully_linked: number
    with_warnings: number
  }
}
