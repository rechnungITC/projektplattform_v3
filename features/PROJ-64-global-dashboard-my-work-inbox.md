# PROJ-64: Global Dashboard / My Work Inbox

## Status: Architected
**Created:** 2026-05-10
**Last Updated:** 2026-05-10

## Dependencies
- Requires: PROJ-1 (Authentication, Tenants, Role-Based Membership) — user- and tenant-scoped dashboard data.
- Requires: PROJ-4 (Platform Foundation — Navigation, Project Roles, RBAC Enforcement) — global navigation and access checks.
- Requires: PROJ-7 (Project Room) — project-level deep links and project health context.
- Requires: PROJ-9 (Work Item Metamodel) — assigned work, overdue work, blocked work, hierarchy labels.
- Requires: PROJ-20 (Risks & Decisions Catalog) — risks, decisions, open items, governance signals.
- Requires: PROJ-21 (Output Rendering) — report/snapshot shortcuts and executive summary links.
- Requires: PROJ-22 (Budget-Modul) — budget exception and variance signals.
- Requires: PROJ-23 (Globale Sidebar-Navigation) — top-level entry placement.
- Requires: PROJ-31 (Approval-Gates) — approval inbox signals.
- Requires: PROJ-35 (Stakeholder-Health) — stakeholder/critical-path risk signals.

## Problem

The authenticated landing page is still a placeholder. Users land on a welcome card instead of an operational work surface.

Modern project-management platforms such as Jira, ClickUp, and monday.com start with actionable surfaces: my assigned work, overdue items, blockers, approvals, health exceptions, workload, and portfolio status. The platform already contains the underlying modules, but the user must navigate into each project and tab to discover what needs attention.

## Goal

Replace the placeholder dashboard with a global **Dashboard / My Work Inbox** that answers:

1. What needs my attention today?
2. Which projects are at risk?
3. Which approvals, decisions, blockers, and overdue items require action?
4. Where should I go next?

This feature is a product-UX slice. It should create a useful central work surface without changing existing domain workflows.

## Non-Goals

- No new project-management entity types.
- No replacement for project-room tabs.
- No full notification system with real-time push in this slice.
- No cross-tenant aggregation.
- No AI agent execution; AI suggestions can be linked if already available.
- No new mobile app shell; responsive web only.

## User Stories

- As a project lead, I want to see my overdue and blocked work across projects so that I can act before status meetings.
- As a team member, I want one page for my assigned tasks and pending approvals so that I do not need to inspect every project manually.
- As a sponsor or steering user, I want to see projects with red/yellow health, budget exceptions, and critical risks so that I can focus on decisions rather than raw task lists.
- As a tenant admin or PMO user, I want portfolio-level exception signals so that I can identify projects needing governance intervention.
- As a user with limited permissions, I want the dashboard to show only data I am allowed to access so that project confidentiality is preserved.

## Acceptance Criteria

### AC-1: Placeholder dashboard replaced
- [ ] The authenticated root route `/` no longer shows placeholder copy such as "Your project dashboard will live here."
- [ ] The page title communicates that this is the user's operational dashboard.
- [ ] The dashboard renders useful empty states when the tenant has no projects or the user has no assigned work.

### AC-2: My Work Inbox
- [ ] The dashboard shows a "My Work" section with work items assigned to the current user.
- [ ] Items are grouped or filterable by at least: overdue, due soon, blocked, in progress.
- [ ] Each item shows project name, work item type, title, status, priority, and due/planned date when available.
- [ ] Each item deep-links to the relevant project/work-item detail surface.
- [ ] Users with no assigned work see a clear empty state.

### AC-3: Approvals and decisions
- [ ] Pending approvals requiring the current user's action are visible from the dashboard.
- [ ] Decision/approval rows show project, title, due/expiry information where available, and action state.
- [ ] Approval items deep-link to the existing approval or decision flow.
- [ ] Users without pending approvals see a compact "none pending" state, not a large empty panel.

### AC-4: Portfolio health exceptions
- [ ] The dashboard shows projects with red/yellow health or missing health signals.
- [ ] Each project row/card shows health, budget, risk, schedule, and approval exception indicators when available.
- [ ] The list prioritizes red/critical projects before yellow/watch projects.
- [ ] Users only see projects they can access.

### AC-5: Budget and risk alerts
- [ ] Budget exceptions are surfaced when a project is over budget, near threshold, missing FX rates, or has unresolved budget warnings.
- [ ] Risk exceptions are surfaced when a project has critical open risks or high stakeholder-health/critical-path risk.
- [ ] Exception cards deep-link into the budget, risks, or stakeholder-health project tabs.

### AC-6: Quick actions
- [ ] The dashboard offers quick actions for common next steps: create project, create work item, open approvals, open reports.
- [ ] Quick actions respect permissions and tenant module activation.
- [ ] Disabled actions explain why they are unavailable.

### AC-7: Saved dashboard views / presets
- [ ] The dashboard supports at least three presets: "My Work", "Project Health", and "Approvals".
- [ ] The selected preset is reflected in the visible sections.
- [ ] Preset switching is keyboard-accessible and works on mobile.

### AC-8: Responsive layout
- [ ] At 1440px, dashboard sections use a dense multi-column operational layout.
- [ ] At 768px, sections stack without losing primary actions.
- [ ] At 375px, the page remains usable with compact cards and no horizontal overflow.

### AC-9: States and feedback
- [ ] Loading state uses skeletons or compact loading rows.
- [ ] Error state identifies which section failed without blanking the whole dashboard.
- [ ] Empty state is actionable and role-aware.
- [ ] Stale or partially unavailable data is shown as "unknown" or "not available", not as green/safe.

### AC-10: Security and permissions
- [ ] All dashboard data is scoped to current tenant and current user's project access.
- [ ] No unauthorized project names, work item titles, budget values, risks, or decisions leak through the dashboard.
- [ ] Admin-only or module-gated actions are hidden or disabled consistently with existing navigation rules.

## Designer Brief

### Benchmark Fit
- **Jira:** backlog/board contextual insights, pending work, reports, project health summaries.
- **ClickUp:** Home/My Work, flexible dashboard cards, saved perspectives, quick create.
- **monday.com:** portfolio health, workload/budget exceptions, PMO-style dashboard rollups.
- **Local V3 template:** `docs/design/dashboards/pmi-dashboard.html`, `scrum-dashboard.html`, and `budget-controlling.html`.

### Recommended View Strategy
- **Default:** "My Work" — assigned work, approvals, urgent exceptions.
- **Secondary:** "Project Health" — portfolio exception view.
- **Secondary:** "Approvals" — formal decisions and approval tasks.
- **Later:** Workload and calendar views when capacity APIs are ready.

### Layout Requirements
- Header: greeting, active tenant, role, quick create.
- KPI strip: assigned open work, overdue work, pending approvals, at-risk projects.
- Main surface: My Work list/cards with filters.
- Right/secondary column: project health exceptions and budget/risk alerts.
- Bottom section: recent reports/snapshots and recently changed projects.

### Interaction Requirements
- Filter chips for overdue, blocked, due soon, approvals, critical.
- Compact rows on desktop; cards on mobile.
- Deep links into existing project-room tabs.
- Refresh action per section if section-level fetch fails.
- Keyboard-accessible preset switcher.

## Edge Cases

- User belongs to multiple tenants: show only active tenant data; tenant switcher remains the cross-tenant mechanism.
- User has no projects: show onboarding-style empty state with "Create project" if permitted.
- User has projects but no assigned work: show health/approval sections and a compact "No assigned work" state.
- A project is deleted or inaccessible after dashboard data loads: hide or show "access changed" on refresh, never expose details.
- A module is disabled: hide related dashboard card or show module-disabled state only to admins.
- Budget summary fails for one project: mark budget status unknown for that project without failing the entire dashboard.
- Work item lacks due/planned date: show "No date" and sort after dated overdue/due-soon items.
- Current user is admin but not project member: dashboard must follow existing access semantics, not tenant-admin assumptions.
- Slow network: skeletons should render quickly and sections should resolve independently.
- Mobile viewport: cards must not require horizontal scrolling.

## Technical Requirements

- Stack: Next.js 16 App Router, TypeScript, Supabase, shadcn/ui.
- Route: authenticated dashboard at `/`.
- Data access must reuse existing project access and tenant scoping helpers.
- Prefer section-level data loading so one failed rollup does not blank the full dashboard.
- Avoid N+1 project queries for portfolio health; architecture should evaluate aggregated API/RPC shape.
- Security: authentication required; RLS-equivalent checks required for all returned entities.
- Performance target: dashboard initial meaningful content under 1.5s on typical tenant data; section-level skeletons acceptable.
- Accessibility: semantic headings, keyboard navigation, visible focus, ARIA labels for status indicators.
- Browser Support: Chrome, Firefox, Safari.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Architecture Decision

PROJ-64 needs both frontend and backend work.

The dashboard should not assemble data by calling every project tab API from the browser. That would be slow, noisy, and hard to secure. Instead, the feature should introduce a dashboard aggregation layer that returns the current user's operational inbox in one tenant-scoped response, while reusing existing project access rules and existing domain calculations.

### Component Structure

```text
Authenticated Dashboard Page (/)
+-- DashboardHeader
|   +-- Greeting / active tenant / role
|   +-- QuickActions
|
+-- DashboardPresetTabs
|   +-- My Work
|   +-- Project Health
|   +-- Approvals
|
+-- DashboardKpiStrip
|   +-- Open assigned work
|   +-- Overdue work
|   +-- Pending approvals
|   +-- At-risk projects
|
+-- DashboardGrid
|   +-- MyWorkPanel
|   |   +-- Filter chips
|   |   +-- Work item rows/cards
|   |
|   +-- ApprovalInboxPanel
|   |   +-- Pending decision approvals
|   |
|   +-- ProjectHealthExceptionsPanel
|   |   +-- Red/yellow project health rows
|   |
|   +-- BudgetRiskAlertsPanel
|   |   +-- Budget exceptions
|   |   +-- Critical risks
|   |
|   +-- RecentReportsPanel
|       +-- Recent status reports / executive summaries
```

Existing components to reuse:

- `DashboardWelcome` should be replaced or reduced to a thin wrapper.
- `Badge`, `Card`, `Tabs`, `Button`, `Skeleton`, `Alert`, `Tooltip`, and existing work-item/status badges should be reused.
- `PendingApprovalsCard` behavior can inform the approval panel, but the global dashboard should avoid embedding project-specific cards that fetch independently.
- `HealthSnapshot` and `resolveProjectHealthSummary` provide the health model, but portfolio aggregation should avoid calling health per project from the browser.

### Data Model In Plain Language

No new persistent domain table is required for the MVP.

The dashboard response should contain computed, read-only summaries:

- Current user context: user id, active tenant, role.
- KPI counters: assigned open work, overdue work, blocked work, pending approvals, at-risk projects.
- My work rows: work item id, project id/name, type, title, status, priority, responsible user, planned/due date, overdue flag, blocked flag, deep link.
- Approval rows: decision id/title, project id/name, deadline, pending state, deep link.
- Project health rows: project id/name, health state, budget state, risk state, schedule state, missing-data state, deep link.
- Alert rows: budget exceptions, missing FX rates, critical risks, stakeholder-health/critical-path warnings where available.
- Report shortcuts: recent reports/snapshots that the user can access.

Saved dashboard presets for this slice can be frontend state or URL state. Persistent user-customized saved views are a later enhancement unless architecture finds an existing user-preferences store.

### Backend Design

Add a dashboard aggregation API for the authenticated root dashboard.

Recommended shape:

- One primary endpoint for the dashboard summary.
- Keep the existing approvals endpoint for compatibility, but the new dashboard endpoint may include the same pending approval data so the page can load in one pass.
- Return section-level result blocks so one failed rollup can show an error while other sections still render.

Backend responsibilities:

- Resolve active user and active tenant.
- Apply existing project access semantics before returning project names or project-linked entities.
- Query assigned work across accessible projects.
- Query pending approvals for the current linked stakeholder user.
- Query accessible projects and compute/attach health exception summaries.
- Attach budget/risk exception signals where available.
- Sort server-side by urgency: overdue/blocked/red first.
- Cap result lists for MVP to keep the page fast, with "view all" links into existing modules.

### Frontend Design

Replace the authenticated root dashboard with a responsive dashboard client.

Desktop layout:

- Header and KPI strip full width.
- Main grid with My Work as the dominant column.
- Secondary column for Approvals, Project Health, and Alerts.
- Recent reports/projects as lower-density supporting section.

Tablet layout:

- Header and KPI strip remain compact.
- Panels stack in priority order: My Work, Approvals, Project Health, Alerts.

Mobile layout:

- Preset tabs at top.
- One panel shown first per preset.
- KPI strip becomes horizontally scrollable cards or a two-column compact grid.
- Rows become cards; no horizontal table scrolling.

### Interaction Design

- Preset tabs: `My Work`, `Project Health`, `Approvals`.
- Filter chips inside My Work: overdue, blocked, due soon, in progress.
- Quick actions: create project, create work item, open approvals, open reports.
- Row click opens existing project/work-item/approval destinations.
- Section retry button appears when one dashboard section fails.
- Refresh action reloads the dashboard summary.
- Empty states are role-aware and actionable.

### Security Design

- Dashboard data must be treated as sensitive because it aggregates project names, work item titles, budget states, risks, and approvals.
- Every returned row must be scoped to the active tenant.
- Project-linked rows must only include projects visible to the current user under existing project access rules.
- Admin-only or module-gated actions must follow the same rules as the global/project navigation.
- Unknown, failed, or unavailable health/budget data must never be shown as green/safe.

### Performance Design

- Avoid browser-side N+1 calls across projects.
- The dashboard API should return a compact MVP payload with capped lists.
- Health and budget rollups can be approximate for the first slice if exact aggregation would require slow per-project computation.
- Slow sections should degrade independently instead of blocking the whole dashboard.
- Initial meaningful content target: under 1.5s on typical tenant data.

### Dependencies

No new frontend package is required for the MVP.

Existing stack is sufficient:

- Next.js App Router
- Supabase
- shadcn/ui
- lucide-react
- existing project/work-item/budget/approval/health helpers

### Testing Strategy

- API route tests for authentication, tenant scoping, project access, and list caps.
- API route tests proving inaccessible projects do not leak through work, health, approval, budget, or report rows.
- Component tests for dashboard empty, loading, section-error, and populated states.
- Responsive QA at 375px, 768px, and 1440px.
- E2E smoke should verify the root route no longer shows placeholder content and renders at least one dashboard section for an authenticated fixture.

### Rollout Plan

1. Backend aggregation endpoint with section-level result blocks.
2. Dashboard UI replacing the placeholder root page.
3. My Work, Approvals, Project Health, and Alert sections.
4. Quick actions and preset tabs.
5. QA against security and responsive acceptance criteria.

### Open Architecture Questions

- Should dashboard preset selection persist per user in this slice, or remain URL/local UI state until a user-preferences store exists?
- How exact must portfolio health be in MVP: exact per-project health summary, or lightweight exception indicators with deep links?
- Should tenant admins see all tenant projects or only projects where existing project access grants visibility? The spec currently chooses existing project access semantics.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
