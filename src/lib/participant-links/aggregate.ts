/**
 * PROJ-57 — Participant-links aggregator.
 *
 * Joins:
 *   - project_memberships (with profiles for display name)
 *   - stakeholders (with linked_user_id)
 *   - resources    (with linked_user_id and source_stakeholder_id)
 *
 * and reconciles them into a per-identity list. Identity merging
 * is best-effort:
 *   1. If user_id is set anywhere, use it as identity_key.
 *   2. Otherwise dedupe stakeholder→resource via
 *      `source_stakeholder_id`.
 *   3. Otherwise treat as standalone.
 *
 * The aggregator does not mutate any data — it's a read-only
 * snapshot the UI can render or the FE can poll on save.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  ParticipantLink,
  ParticipantRateSource,
  ProjectParticipantLinksSnapshot,
} from "./types"

interface AggregateArgs {
  supabase: SupabaseClient
  projectId: string
  tenantId: string
  now?: Date
}

interface MembershipRow {
  id: string
  user_id: string
  role: "lead" | "editor" | "viewer"
  profile: { id: string; email: string | null; display_name: string | null } | null
}

interface StakeholderRow {
  id: string
  name: string | null
  linked_user_id: string | null
  is_active: boolean | null
  role_key: string | null
}

interface ResourceRow {
  id: string
  display_name: string | null
  linked_user_id: string | null
  source_stakeholder_id: string | null
  is_active: boolean | null
  daily_rate_override: number | null
  daily_rate_override_currency: string | null
}

export async function resolveProjectParticipantLinks(
  args: AggregateArgs,
): Promise<ProjectParticipantLinksSnapshot> {
  const now = args.now ?? new Date()

  const [membersRes, stakeholdersRes, resourcesRes] = await Promise.all([
    args.supabase
      .from("project_memberships")
      .select(
        "id, user_id, role, profile:profiles!project_memberships_user_id_fkey(id, email, display_name)",
      )
      .eq("project_id", args.projectId),
    args.supabase
      .from("stakeholders")
      .select("id, name, linked_user_id, is_active, role_key")
      .eq("project_id", args.projectId),
    // Resources are tenant-scoped, not project-scoped. We surface
    // the ones that are linked to either a project-member user OR
    // to a project-stakeholder. That keeps the participant list
    // bounded without pulling the full tenant-wide resource pool.
    args.supabase
      .from("resources")
      .select(
        "id, display_name, linked_user_id, source_stakeholder_id, is_active, daily_rate_override, daily_rate_override_currency",
      )
      .eq("tenant_id", args.tenantId),
  ])

  const members = ((membersRes.data ?? []) as unknown as MembershipRow[]).map(
    (m) => ({
      ...m,
      profile: Array.isArray(m.profile) ? m.profile[0] ?? null : m.profile,
    }),
  )
  const stakeholders = (stakeholdersRes.data ?? []) as unknown as StakeholderRow[]
  const allResources = (resourcesRes.data ?? []) as unknown as ResourceRow[]

  const projectUserIds = new Set(members.map((m) => m.user_id))
  const projectStakeholderIds = new Set(stakeholders.map((s) => s.id))
  // Filter resources to ones connected to this project.
  const resources = allResources.filter(
    (r) =>
      (r.linked_user_id && projectUserIds.has(r.linked_user_id)) ||
      (r.source_stakeholder_id &&
        projectStakeholderIds.has(r.source_stakeholder_id)),
  )

  // ---- Merge by identity_key ----
  // Pass 1: build identity slots keyed by user_id when present.
  const slots = new Map<string, ParticipantLink>()
  function slotFor(key: string): ParticipantLink {
    let slot = slots.get(key)
    if (!slot) {
      slot = emptySlot(key)
      slots.set(key, slot)
    }
    return slot
  }
  function fillName(slot: ParticipantLink, candidate: string | null | undefined) {
    if (!slot.display_name && candidate) slot.display_name = candidate
  }
  function fillEmail(slot: ParticipantLink, candidate: string | null | undefined) {
    if (!slot.email && candidate) slot.email = candidate
  }

  for (const m of members) {
    const slot = slotFor(`user:${m.user_id}`)
    slot.is_tenant_member = true
    slot.is_project_member = true
    slot.project_role = m.role
    slot.user_id = m.user_id
    slot.project_membership_id = m.id
    fillName(slot, m.profile?.display_name ?? m.profile?.email ?? null)
    fillEmail(slot, m.profile?.email ?? null)
  }

  for (const s of stakeholders) {
    const key = s.linked_user_id ? `user:${s.linked_user_id}` : `stakeholder:${s.id}`
    const slot = slotFor(key)
    slot.is_stakeholder = true
    slot.stakeholder_id = s.id
    if (s.linked_user_id) {
      slot.is_tenant_member = true
      slot.user_id = s.linked_user_id
    }
    fillName(slot, s.name)
  }

  for (const r of resources) {
    const key = r.linked_user_id
      ? `user:${r.linked_user_id}`
      : r.source_stakeholder_id
        ? `stakeholder:${r.source_stakeholder_id}`
        : `resource:${r.id}`
    const slot = slotFor(key)
    slot.is_resource = true
    slot.resource_id = r.id
    if (r.linked_user_id) slot.user_id = r.linked_user_id
    if (r.source_stakeholder_id) slot.stakeholder_id = r.source_stakeholder_id
    fillName(slot, r.display_name)
    slot.rate_source = classifyRateSource(r, stakeholders)
  }

  // ---- Warnings (PROJ-57 link assistant signals) ----
  for (const slot of slots.values()) {
    if (slot.is_stakeholder && !slot.is_project_member && slot.user_id) {
      slot.link_warnings.push(
        "Stakeholder hat einen Login, ist aber kein Projektmitglied.",
      )
    }
    if (slot.is_resource && !slot.is_stakeholder) {
      slot.link_warnings.push(
        "Resource ist nicht an einen Stakeholder gebunden — Tagessatz wird über Override oder gar nicht aufgelöst.",
      )
    }
    if (
      slot.is_resource &&
      slot.rate_source.kind === "unresolved"
    ) {
      slot.link_warnings.push("Tagessatz nicht auflösbar — Override pflegen.")
    }
    if (slot.is_project_member && !slot.is_stakeholder) {
      slot.link_warnings.push(
        "Projektmitglied ist nicht als Stakeholder erfasst — fachliche Rolle fehlt.",
      )
    }
  }

  const participants: ParticipantLink[] = Array.from(slots.values()).map(
    (slot) => {
      if (!slot.display_name) slot.display_name = "Unbenannte Person"
      return slot
    },
  )

  const counts = {
    total: participants.length,
    members: participants.filter((p) => p.is_project_member).length,
    stakeholders: participants.filter((p) => p.is_stakeholder).length,
    resources: participants.filter((p) => p.is_resource).length,
    fully_linked: participants.filter(
      (p) => p.is_project_member && p.is_stakeholder && p.is_resource,
    ).length,
    with_warnings: participants.filter((p) => p.link_warnings.length > 0).length,
  }

  return {
    project_id: args.projectId,
    generated_at: now.toISOString(),
    participants,
    counts,
  }
}

function emptySlot(key: string): ParticipantLink {
  return {
    identity_key: key,
    display_name: "",
    email: null,
    is_tenant_member: false,
    is_project_member: false,
    project_role: null,
    is_stakeholder: false,
    is_resource: false,
    user_id: null,
    project_membership_id: null,
    stakeholder_id: null,
    resource_id: null,
    rate_source: { kind: "none" },
    link_warnings: [],
  }
}

function classifyRateSource(
  r: ResourceRow,
  stakeholders: StakeholderRow[],
): ParticipantRateSource {
  if (
    r.daily_rate_override != null &&
    r.daily_rate_override_currency &&
    r.daily_rate_override > 0
  ) {
    return {
      kind: "override",
      amount: r.daily_rate_override,
      currency: r.daily_rate_override_currency,
    }
  }
  const sourceStakeholder = r.source_stakeholder_id
    ? stakeholders.find((s) => s.id === r.source_stakeholder_id)
    : null
  if (sourceStakeholder?.role_key) {
    return { kind: "role_rate", role_key: sourceStakeholder.role_key }
  }
  if (r.source_stakeholder_id && !sourceStakeholder?.role_key) {
    return {
      kind: "unresolved",
      reason:
        "Stakeholder ist gebunden, hat aber keinen role_key — kein Role-Rate möglich.",
    }
  }
  return {
    kind: "unresolved",
    reason: "Weder Override noch role_key vorhanden.",
  }
}
