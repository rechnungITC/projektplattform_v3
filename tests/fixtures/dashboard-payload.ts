/**
 * PROJ-Y-143h — pinned dashboard payload for the visual baseline.
 *
 * Why this exists: `/` is the only page in the visual suite whose stability
 * came from the *tenant* rather than from the page. Every KPI read 0 and My
 * Work read "0 Items" purely because nothing was assigned to the [E2E] user,
 * and four panels format dates. PROJ-Y-143g measured both failure modes — a
 * single counter going 0 -> 3 costs 82 px, so a tight bound would go red the
 * moment any other spec seeds data, while the 2% ratio was wide enough
 * (~44,000 px) to let My Work fill with rows unnoticed.
 *
 * Two routes were registered there: masking the panels (needs `data-testid`
 * in seven production components, and masks away most of what the snapshot
 * is *for*) or pinning seed data in the shared [E2E] tenant (pollutes a
 * tenant other specs read, and cannot pin relative-time rendering anyway).
 * This file is the third option and beats both: the three dashboard
 * endpoints are answered from here at the network boundary, so the page is
 * real — real shell, real components, real layout — and only its *data* is
 * fixed. No production code changes, nothing written to the tenant.
 *
 * Fixture drift is handled by the type system, not by hope: this object is
 * declared `DashboardSummary`, the same contract the production hook
 * consumes. If the API contract changes, this file stops compiling. The
 * companion spec additionally compares the live endpoint's top-level keys
 * against these, which catches a server that drifts away from its own type.
 *
 * Dates are absolute and far from any boundary, and the spec freezes the
 * clock at FIXED_NOW. Both are needed: the panels render absolute dates via
 * `toLocaleDateString("de-DE")` (stable on their own), but the "Bald fällig"
 * chip counts through `Date.now()` (`my-work-panel.tsx`), so a fixed due
 * date would silently change bucket as real time passes.
 */

import type { PendingApprovalSummary } from "../../src/types/decision-approval"
import type { DashboardSummary } from "../../src/types/dashboard"

/**
 * The instant the browser clock is pinned to. Chosen so that the fixture's
 * due dates sit unambiguously inside their buckets: 2026-03-10 is 5 days
 * ahead (due soon, < 7), 2026-02-20 is well past (overdue), and 2026-06-30
 * is far enough out to be neither.
 */
export const FIXED_NOW = new Date("2026-03-05T09:00:00.000Z")

const PROJECT_A = "11111111-1111-4111-8111-111111111111"
const PROJECT_B = "22222222-2222-4222-8222-222222222222"

export const dashboardSummaryFixture: DashboardSummary = {
  user_context: {
    user_id: "e2e00000-0000-4e2e-8e2e-000000000001",
    tenant_id: "e2e00000-0000-4e2e-8e2e-000000000002",
    is_tenant_admin: true,
  },
  generated_at: FIXED_NOW.toISOString(),
  kpis: {
    open_assigned: 4,
    overdue: 2,
    pending_approvals: 2,
    at_risk_projects: 1,
  },
  my_work: {
    state: "ready",
    data: {
      items: [
        {
          work_item_id: "aaaaaaa1-0000-4000-8000-000000000001",
          project_id: PROJECT_A,
          project_name: "ERP Rollout",
          project_method: "waterfall",
          kind: "work_package",
          title: "Stammdaten-Migration abstimmen",
          status: "in_progress",
          priority: "high",
          due_date: "2026-02-20",
          is_overdue: true,
          is_blocked: false,
          href: `/projects/${PROJECT_A}/arbeitspakete`,
        },
        {
          work_item_id: "aaaaaaa1-0000-4000-8000-000000000002",
          project_id: PROJECT_A,
          project_name: "ERP Rollout",
          project_method: "waterfall",
          kind: "subtask",
          title: "Testfälle für Rechnungsimport freigeben",
          status: "blocked",
          priority: "medium",
          due_date: "2026-02-27",
          is_overdue: true,
          is_blocked: true,
          href: `/projects/${PROJECT_A}/arbeitspakete`,
        },
        {
          work_item_id: "aaaaaaa1-0000-4000-8000-000000000003",
          project_id: PROJECT_B,
          project_name: "Portal Relaunch",
          project_method: "scrum",
          kind: "story",
          title: "Rollen- und Rechtekonzept dokumentieren",
          status: "todo",
          priority: "medium",
          due_date: "2026-03-10",
          is_overdue: false,
          is_blocked: false,
          href: `/projects/${PROJECT_B}/backlog`,
        },
        {
          work_item_id: "aaaaaaa1-0000-4000-8000-000000000004",
          project_id: PROJECT_B,
          project_name: "Portal Relaunch",
          project_method: "scrum",
          kind: "task",
          title: "Schnittstelle zum Zahlungsdienstleister prüfen",
          status: "in_progress",
          priority: "low",
          due_date: "2026-06-30",
          is_overdue: false,
          is_blocked: false,
          href: `/projects/${PROJECT_B}/backlog`,
        },
      ],
      total: 4,
      capped: false,
    },
  },
  approvals: {
    state: "ready",
    data: {
      items: [
        {
          decision_id: "bbbbbbb1-0000-4000-8000-000000000001",
          decision_title: "Vergabe Hosting-Partner",
          project_id: PROJECT_A,
          project_name: "ERP Rollout",
          approver_id: "e2e00000-0000-4e2e-8e2e-000000000001",
          submitted_at: "2026-03-02T08:00:00.000Z",
          deadline_at: "2026-03-09T08:00:00.000Z",
          status: "pending",
          href: `/projects/${PROJECT_A}/entscheidungen`,
        },
        {
          decision_id: "bbbbbbb1-0000-4000-8000-000000000002",
          decision_title: "Freigabe Migrationsfenster",
          project_id: PROJECT_B,
          project_name: "Portal Relaunch",
          approver_id: "e2e00000-0000-4e2e-8e2e-000000000001",
          submitted_at: "2026-02-28T08:00:00.000Z",
          deadline_at: null,
          status: "pending",
          href: `/projects/${PROJECT_B}/entscheidungen`,
        },
      ],
      total: 2,
    },
  },
  project_health: {
    state: "ready",
    data: {
      items: [
        {
          project_id: PROJECT_A,
          project_name: "ERP Rollout",
          project_type: "erp",
          project_method: "waterfall",
          lifecycle_status: "active",
          health: "red",
          budget_state: "red",
          risk_state: "yellow",
          schedule_state: "yellow",
          stakeholder_state: "green",
          reason: "Budget 112% · 3 überfällige Meilensteine",
          href: `/projects/${PROJECT_A}`,
        },
      ],
      total_accessible_projects: 2,
    },
  },
  alerts: {
    state: "ready",
    data: {
      items: [
        {
          id: "ccccccc1-0000-4000-8000-000000000001",
          project_id: PROJECT_A,
          project_name: "ERP Rollout",
          kind: "budget_overrun",
          title: "Budget überschritten",
          detail: "Ist 112% des freigegebenen Rahmens",
          severity: "critical",
          href: `/projects/${PROJECT_A}/budget`,
        },
        {
          id: "ccccccc1-0000-4000-8000-000000000002",
          project_id: PROJECT_B,
          project_name: "Portal Relaunch",
          kind: "critical_risk",
          title: "Kritisches Risiko ohne Maßnahme",
          detail: "Ausfall Zahlungsdienstleister",
          severity: "warning",
          href: `/projects/${PROJECT_B}/risiken`,
        },
      ],
    },
  },
  reports: {
    state: "ready",
    data: {
      items: [
        {
          snapshot_id: "ddddddd1-0000-4000-8000-000000000001",
          project_id: PROJECT_A,
          project_name: "ERP Rollout",
          kind: "status_report",
          version: 3,
          generated_at: "2026-03-01T10:00:00.000Z",
          href: `/projects/${PROJECT_A}/reports`,
        },
      ],
    },
  },
  capabilities: {
    can_create_project: true,
    can_create_work_item: true,
    can_open_approvals: true,
    can_open_reports: true,
  },
}

/**
 * `/api/dashboard/approvals` — the dedicated PROJ-31 endpoint. The client
 * skips it when the summary already carries approvals, but it is routed
 * anyway so the fixture holds regardless of that optimisation.
 */
export const dashboardApprovalsFixture: { approvals: PendingApprovalSummary[] } =
  {
    approvals: (dashboardSummaryFixture.approvals.data?.items ?? []).map(
      (item) => ({
        decision_id: item.decision_id,
        decision_title: item.decision_title,
        project_id: item.project_id,
        project_name: item.project_name,
        approver_id: item.approver_id,
        magic_link_expires_at: null,
        submitted_at: item.submitted_at,
        deadline_at: item.deadline_at,
        approval_status: item.status,
      }),
    ),
  }

/** `/api/dashboard/deliverable-approvals` — PROJ-105 α. Empty by design. */
export const dashboardDeliverableApprovalsFixture = { approvals: [] }
