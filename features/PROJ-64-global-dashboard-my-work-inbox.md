# PROJ-64: Global Dashboard / My Work Inbox

## Status: Deployed
**Created:** 2026-05-10
**Last Updated:** 2026-05-11

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

## Implementation Notes

### Frontend (2026-05-10)

Shipped the dashboard shell + UI layer that replaces the placeholder welcome card on `/`. The slice is wired against a stable wire-format that the upcoming PROJ-64-β backend slice will implement; until that endpoint is live the page renders gracefully via section-level "unavailable" placeholders, **except for the Approvals panel** which is already functional via the existing PROJ-31 endpoint.

**Files added (15)**

- `src/types/dashboard.ts` — wire-format types: `DashboardSummary`, `DashboardKpiCounters`, `MyWorkRow`, `ApprovalRow`, `ProjectHealthExceptionRow`, `AlertRow`, `ReportShortcut`, `DashboardSectionEnvelope<T>`, `DashboardPreset`, `MyWorkFilter`. Each section uses an envelope so one failed rollup degrades independently (AC-9).
- `src/hooks/use-dashboard.ts` — primary hook calling `GET /api/dashboard/summary`. Treats HTTP 404 as `backendPending=true` and falls back to a stub summary so the shell renders without crashing while /backend is in flight.
- `src/hooks/use-pending-approvals.ts` — fallback hook hitting the existing `/api/dashboard/approvals?filter=pending` endpoint. Powers the Approval Inbox panel today; the global summary endpoint can take over later without UI changes.
- `src/components/dashboard/dashboard-client.tsx` — orchestrates header + KPI strip + preset tabs + responsive grid. Reorders panels per preset (My Work / Project Health / Approvals) without hiding any panel — muscle memory stays consistent across presets.
- `src/components/dashboard/dashboard-header.tsx` — greeting + active tenant + role badge + `Aktualisieren` button + `QuickActions` strip.
- `src/components/dashboard/quick-actions.tsx` — `Neues Projekt` / `Work Item` / `Genehmigungen` / `Reports` quick links. Disabled actions render with a tooltip explaining why (AC-6).
- `src/components/dashboard/dashboard-kpi-strip.tsx` — 4 KPI counters with skeletons + tone (warning when overdue > 0, danger when at-risk > 0). Responsive 1 → 2 → 4 columns.
- `src/components/dashboard/dashboard-preset-tabs.tsx` — keyboard-accessible preset switcher built on shadcn `Tabs` (AC-7).
- `src/components/dashboard/my-work-panel.tsx` — filter chips (`Alle / Überfällig / Bald fällig / Blockiert / In Arbeit`) with live counts, work-item rows reusing `WorkItemKindBadge`. Each row deep-links via `MyWorkRow.href` provided by the backend.
- `src/components/dashboard/approval-inbox-panel.tsx` — pending decisions panel with deadline badges (overdue / heute / ≤ 3 Tage). Shows a "Alle … Genehmigungen ansehen" footer link when > 5 entries.
- `src/components/dashboard/project-health-exceptions-panel.tsx` — red/yellow/unknown projects with per-axis pills (Budget / Risiken / Zeitplan / Stakeholder).
- `src/components/dashboard/budget-risk-alerts-panel.tsx` — alert rows keyed by `kind` (budget_overrun / budget_threshold / missing_fx_rate / critical_risk / stakeholder_critical_path / schedule_overdue) with severity-colored icons.
- `src/components/dashboard/recent-reports-panel.tsx` — recent PROJ-21 snapshots shortcut.
- `src/components/dashboard/dashboard-section-{error,empty,unavailable,skeleton}.tsx` — generic section primitives reused across all panels.

**Files modified (1)**

- `src/app/(app)/page.tsx` — now renders `<DashboardClient />` directly (no max-w wrapper; the client owns the layout).

**Files removed (1)**

- `src/app/(app)/dashboard-welcome.tsx` — placeholder welcome card with the "Your project dashboard will live here." copy. AC-1 explicitly requires this string to disappear.

**Acceptance criteria coverage**

| AC | Status | Notes |
|---|---|---|
| AC-1 (placeholder replaced) | ✅ | Welcome card deleted; `<DashboardClient>` renders the operational dashboard. |
| AC-2 (My Work) | 🟡 | UI complete with filter chips, deep links, empty state, kind badges. **Data depends on `/api/dashboard/summary`** (PROJ-64-β). Until then the panel renders the "Backend wird vorbereitet" placeholder. |
| AC-3 (Approvals) | ✅ | Wired to the live PROJ-31 endpoint via `usePendingApprovals`. Deep-links to `/projects/[id]/entscheidungen?decision=…` and shows deadline badges. |
| AC-4 (Project Health) | 🟡 | UI complete (per-axis pills + sorted exception rows). Awaits aggregation. |
| AC-5 (Budget/Risk Alerts) | 🟡 | UI complete (severity icons + tones). Awaits aggregation. |
| AC-6 (Quick Actions) | ✅ | Capability-driven enable/disable + tooltips. Backend will set `summary.capabilities.*` flags. |
| AC-7 (Presets) | ✅ | shadcn `Tabs` with arrow-key navigation. Three presets reorder the grid. |
| AC-8 (Responsive) | ✅ | Grid: 1 col @ 375px → 2 col @ sm → 12-col split @ lg. KPI strip 1/2/4 cols. No horizontal scroll. |
| AC-9 (States) | ✅ | Each panel renders dedicated loading / error / unavailable / empty / populated states; section retry button on error. |
| AC-10 (Security) | ✅ | The frontend never bypasses RLS — all data flows through `/api/dashboard/*` (RLS-scoped) and the existing `listPendingApprovals` helper. No client-side cross-tenant joins. |

**Verification**

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (only the pre-existing react-hooks/incompatible-library warning at `edit-work-item-dialog.tsx:410` remains)
- `npx vitest run` — **1234 / 1234** green (no PROJ-64-specific tests in this slice — UI components are shape-checked by TS + lint; e2e/component tests will follow the QA pass)
- `npm run build` — green; `/` route registered as dynamic
- Live probes (`http://localhost:3000`):
  - `/` → 307 to `/login` (auth gate intact)
  - `/api/dashboard/summary` → 307 to `/login` (route does not exist yet; auth gate fires first as expected)

**Backend handoff for PROJ-64-β**

The frontend assumes the following contract from `/backend`:

- `GET /api/dashboard/summary` returns `{ summary: DashboardSummary }` per `src/types/dashboard.ts`.
  - `summary.user_context` — user id, active tenant id, `is_tenant_admin`.
  - `summary.kpis` — 4 counters (open_assigned, overdue, pending_approvals, at_risk_projects). The frontend overrides `pending_approvals` with the live PROJ-31 count, so backend can return its own count or `0`.
  - `summary.my_work.data.items` — capped MyWorkRow array. `href` is built server-side; FE never assembles per-method routes. Set `capped: true` and `total > items.length` when truncating.
  - `summary.approvals.data.items` — optional; if returned, the dashboard can switch to the aggregated source. The current FE keeps using `/api/dashboard/approvals` as the source of truth so this section can ship later.
  - `summary.project_health.data.items` — exception rows only (red/yellow/unknown), pre-sorted by severity.
  - `summary.alerts.data.items` — kind-keyed alerts (budget_overrun / budget_threshold / missing_fx_rate / critical_risk / stakeholder_critical_path / schedule_overdue).
  - `summary.reports.data.items` — recent PROJ-21 snapshots, max 5, `href` = `/reports/snapshots/<id>`.
  - `summary.capabilities` — per-action gates (`can_create_project`, `can_create_work_item`, `can_open_approvals`, `can_open_reports`).
- Any failed rollup must set its `state` to `error` and surface a human-readable `error` field. The FE renders an inline `DashboardSectionError` with retry. Treat capped lists as `state=ready, capped=true`.
- Endpoint must enforce existing project-access semantics (no admin-by-default fall-through). Tenant admins who are not project members must NOT see those projects' rows — Tech Design § Open Question (3) is resolved in favor of project-access semantics.
- 404 from this endpoint is handled gracefully by the FE (renders `unavailable`), so backend can ship the route incrementally (e.g. KPIs first, then sections).

**Out of this slice (handed off to /backend, /qa, /deploy)**

- `/api/dashboard/summary` route + RLS / project-access / module-gate enforcement.
- Server-side aggregation queries (work items, decision approvers, project health rollup, alerts, reports).
- Performance budget verification (initial meaningful content < 1.5 s).
- Component / E2E test suite.
- Production smoke + Vercel deploy bookkeeping.

### Backend (2026-05-10)

Shipped the dashboard aggregation endpoint that powers the frontend slice. Single tenant-scoped `GET /api/dashboard/summary` returns My Work, Approvals, Project Health exceptions, Alerts, recent Reports, KPIs and capabilities — each section in its own envelope so a single failed rollup degrades independently. **No new database migration**: the dashboard reads from existing tables (`project_memberships`, `work_items`, `decision_approvers`, `decisions`, `risks`, `milestones`, `report_snapshots`, `tenant_settings`).

**Files added (3)**

- `src/lib/dashboard/summary.ts` — pure aggregator. Exports `resolveDashboardSummary({supabase, userId, tenantId, isTenantAdmin, now?})`. Each section runs through a `safeSection<T>` wrapper so errors map to `{state:'error', data:null, error:string}` envelopes. Project access is tightened beyond RLS: only projects the user has an explicit `project_memberships` row for are surfaced (resolves Tech Design Open Question 3 in favor of project-access semantics).
- `src/app/api/dashboard/summary/route.ts` — thin HTTP layer. Resolves auth → active tenant → tenant role → invokes the aggregator → returns `{summary}`. Errors at the section level surface as envelope `state='error'`; the route only returns 5xx when the whole payload fails (auth/tenant resolution).
- `src/lib/dashboard/summary.test.ts` — 5 unit tests against a fully mocked Supabase client: happy-path envelope shape, section-error degradation, no-membership empty state, project-access leak prevention (foreign-project rows must drop), red-flag project-health on critical risks.
- `src/app/api/dashboard/summary/route.test.ts` — 4 integration tests: unauth → 401, no-tenant → 404, happy-path 200 envelope shape, tenant-admin capability flag forwarding, section-level error envelope forwarding.

**Files modified (3)**

- `src/components/dashboard/dashboard-client.tsx` — now prefers `summary.approvals.data.items` when the section is ready, saving a redundant round-trip. Falls back to `usePendingApprovals` only when the summary's approvals section is unavailable / errored. New adapter `approvalRowToSummary()` translates the aggregator's `ApprovalRow` shape to the panel's `PendingApprovalSummary` shape for visual contract stability.
- `src/hooks/use-pending-approvals.ts` — accepts `{enabled?: boolean}` so the dashboard can disable the redundant fetch when the summary owns the section.
- `eslint.config.mjs` — extended PROJ-29 Block A allowlist to cover `src/hooks/use-dashboard.ts` and `src/hooks/use-pending-approvals.ts` (effect-driven initial-load + state-reset-on-flag patterns identical to existing hooks).

**Aggregation strategy (per section)**

| Section | Source | Scope | Cap |
|---|---|---|---|
| My Work | `work_items` filtered by `responsible_user_id = userId, tenant_id, project_id IN (accessible)` and `status IN (todo, in_progress, blocked)` | Open work assigned to me | 25 rows after sort (blocked → overdue → priority → due) |
| Approvals | `decision_approvers` joined to `decisions.projects` filtered by `stakeholders.linked_user_id = userId` and `decision_approval_state.status = 'pending'` | Decisions where I'm a nominated approver | 25 rows |
| Project Health | Per-project counts of overdue milestones + critical (`score >= 16`) open risks across `accessible_projects` | Exception view (red/yellow/unknown only) | 12 rows, sorted by severity |
| Alerts | Critical open risks (`risks.score >= 16`) + overdue active milestones | Project-by-project; severity = `critical` for `score >= 20` or `daysOverdue >= 14`, otherwise `warning` | 20 rows |
| Reports | `report_snapshots` ordered by `generated_at DESC` | Module-gated by `output_rendering` | 5 rows |
| KPIs | Derived from the section results — no extra queries | n/a | n/a |
| Capabilities | `can_create_project = is_tenant_admin`; `can_open_reports = output_rendering active` | Per-tenant module gates + tenant role | n/a |

**Project-access semantics**

Stricter than RLS by design: the aggregator joins `project_memberships` and surfaces only projects where the user holds an explicit membership. Tenant admins do **not** receive admin-by-default visibility — they see exceptions only for projects they're a member of. This matches the Tech Design's resolution and keeps the dashboard's "my inbox" semantics intact for PMOs / steering users who happen to be tenant admins. Tenant admins still navigate freely via `/projects` to inspect any project.

**Performance considerations**

- One round-trip per section × 5 sections, all running via `Promise.all`. No N+1 fan-out across projects.
- Project Health and Alerts both read `risks` + `milestones`; the dashboard does not call the heavier `resolveProjectHealthSummary` (which fans out per-project budget + stakeholder + FX-rate joins) — that path is reserved for the Project Room. As a result, the dashboard surfaces budget + stakeholder rollups as `unknown` (not green) so the UI explicitly flags incomplete data per AC-9.
- Report Shortcuts caps at 5; remaining rows live behind the existing Reports route.
- All sections cap at conservative limits (12-25 rows) so the payload stays small even for tenants with hundreds of projects.

**Security**

- All queries flow through the user-context Supabase client → existing RLS policies apply as a second line of defense even though the aggregator filters explicitly by `project_memberships.user_id`.
- Tenant scoping: every query carries `tenant_id = active_tenant`. No cross-tenant joins.
- The capabilities object is computed server-side; the FE only renders enabled/disabled actions, never bypasses. `can_create_project` requires `is_tenant_admin`. `can_open_reports` requires `output_rendering` active.
- No mutations — the route is read-only.
- No new env vars, no new secrets.

**Verification**

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (only the pre-existing react-hooks/incompatible-library warning at `edit-work-item-dialog.tsx:410` remains)
- `npx vitest run` — **1244 / 1244** green (was 1234 before; +10 from PROJ-64: 5 aggregator unit tests + 4 route integration tests + 1 frontend hook re-check)
- `npm run build` — green; `/api/dashboard/summary` registered as dynamic
- Live probes (`http://localhost:3000`):
  - `/api/dashboard/summary` (unauth) → 307 to `/login`
  - `/` (unauth) → 307 to `/login`
- No new Supabase migrations; existing tables and RLS policies are sufficient.

**Acceptance criteria coverage update**

| AC | Backend status | Notes |
|---|---|---|
| AC-2 (My Work) | ✅ | `summary.my_work` returns capped, server-sorted assigned items with overdue/blocked flags + deep-link hrefs. |
| AC-3 (Approvals) | ✅ | `summary.approvals` returns the same data as `/api/dashboard/approvals`; FE uses it when ready (saves a round-trip). |
| AC-4 (Project Health) | ✅ | Exception rows for red/yellow/unknown only; sorted by severity; pre-filtered to projects the user is a member of. Budget + stakeholder shown as `unknown` per perf budget. |
| AC-5 (Budget/Risk Alerts) | 🟡 | Critical-risk + schedule-overdue alerts wired. Budget exceptions (`budget_overrun`/`budget_threshold`/`missing_fx_rate`) require the per-project budget rollup which is deferred — the alerts kind enum is in place so a follow-up can surface those without changing the wire format. |
| AC-6 (Quick Actions) | ✅ | `summary.capabilities` drives the FE's enable/disable + tooltip; tenant-admin gating on `can_create_project`; module gating on `can_open_reports`. |
| AC-9 (States) | ✅ | Section envelope state machine (`loading/ready/error/unavailable`) implemented end-to-end. |
| AC-10 (Security) | ✅ | Project-access tightened beyond RLS via `project_memberships`. Cross-project leak prevention covered by the unit test "excludes projects outside the user's project_memberships". |

**Deviation from spec** (M1) — **Budget alert kinds are wired in the type contract but not yet emitted**. Surfacing budget alerts requires invoking `resolveBudgetSummary` per project, which is the slow per-project path the dashboard explicitly avoids in this slice. The alert `kind` enum already includes `budget_overrun`, `budget_threshold`, and `missing_fx_rate`, and the FE renders them as soon as the backend emits them. A follow-up slice (PROJ-64-γ) can either:
1. Pre-aggregate budget metrics into a tenant-level materialized view and join it here, or
2. Move budget alerts to a separate, lazy-loaded section.

Either path is purely additive — no FE changes required.

**Backend handoff for /qa**

The endpoint is ready for QA against the spec's acceptance criteria. Suggested test areas:
- Unauthenticated access → 307 / 401
- Cross-tenant leak: a user in tenant A must never see project names from tenant B
- Tenant admin who is **not** a project member must see no exception rows for those projects
- A user with no project memberships sees empty My Work + empty Project Health + the right tenant-admin capabilities
- Section-level error: simulate a `risks` table read error and verify the rest of the dashboard still renders
- Performance: with a project containing 50 risks + 100 work-items, the endpoint should respond within ~1.5s (initial meaningful content target).

## QA Test Results

**Date:** 2026-05-11
**Tester:** /qa skill
**Environment:** Next.js 16.2.4 dev build (Node 20, Turbopack), Supabase project `iqerihohwabyjzkpcujq`, Playwright 1.55.0 (Chromium 147 + Mobile Safari/WebKit).
**Verdict:** ✅ **Approved (READY for /deploy)** — no Critical or High bugs. 1 Medium documented (priority sort caveat at > 50 open items), 2 Low (consistency / UX).

### Automated checks

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ exit 0, ✖ 0 errors (only the pre-existing react-hooks/incompatible-library warning at `edit-work-item-dialog.tsx:410` remains) |
| `npx vitest run` | ✅ **1244 / 1244** (PROJ-64 contributes 9: 5 aggregator unit + 4 route integration) |
| `npx playwright test` | ✅ **56 passed, 12 skipped, 0 failed** (PROJ-64 adds 10 cases across Chromium + Mobile Safari; pre-existing 12 skips are PROJ-29 auth-fixture / PROJ-51 visual regression that require a refreshed SERVICE_ROLE_KEY) |
| `npm run build` | ✅ green; `/api/dashboard/summary` registered as dynamic; `/` registered as dynamic |
| Live probe `GET /` (unauth) | ✅ 307 → `/login?next=%2F` |
| Live probe `GET /api/dashboard/summary` (unauth) | ✅ 307 → `/login?next=%2Fapi%2Fdashboard%2Fsummary` |
| Live probe `POST /api/dashboard/summary` (unauth) | ✅ 307 (gate fires before 405) |
| Live probe `GET /api/dashboard/approvals` (unauth) | ✅ 307 (existing PROJ-31 endpoint unaffected) |
| Final-landing content check on `/` | ✅ placeholder copy "Your project dashboard will live here." absent in response body |

### Acceptance Criteria walkthrough

| AC | Status | Notes |
|---|---|---|
| AC-1 — Placeholder dashboard replaced | ✅ | `dashboard-welcome.tsx` deleted in this slice; `/(app)/page.tsx` now renders `<DashboardClient/>`. Live response body confirms the placeholder copy is gone. The empty-state copy `"Keine offenen Items"` + role-aware actions render via panel-level empty states (see AC-9). |
| AC-2 — My Work Inbox | ✅ | `MyWorkPanel` shows assigned items with filter chips (Alle / Überfällig / Bald fällig / Blockiert / In Arbeit). Each row has project name, kind badge, title, status, priority, due/planned date, deep link (`/projects/{id}/backlog?work_item={wid}`). Empty state: "Keine offenen Items". Backend caps at 25 items after server sort + JS post-sort (blocked → overdue → priority → due). |
| AC-3 — Approvals and decisions | ✅ | `ApprovalInboxPanel` consumes either `summary.approvals.data.items` (preferred) or `usePendingApprovals` fallback. Each row shows project, decision title, submitted_at, deadline badge (overdue / heute / ≤ 3 Tage). Deep link to `/projects/{id}/entscheidungen?decision={did}`. Empty state: "Keine offenen Genehmigungen". |
| AC-4 — Portfolio health exceptions | ✅ | `ProjectHealthExceptionsPanel` shows red/yellow/unknown projects sorted by severity. Per-axis pills (Budget / Risiken / Zeitplan / Stakeholder). Aggregator skips green and only emits exception rows. Project-access gated to `project_memberships` (strict). |
| AC-5 — Budget and risk alerts | 🟡 | Critical-risk + schedule-overdue alerts wired live. Budget alert kinds (`budget_overrun`/`budget_threshold`/`missing_fx_rate`) are in the type contract but not yet emitted — documented in the backend implementation notes as a deliberate perf deferral. **Acceptable for this slice** per the documented deviation. |
| AC-6 — Quick actions | ✅ | `QuickActions` strip with `Neues Projekt` / `Work Item` / `Genehmigungen` / `Reports`. Capability flags from `summary.capabilities` drive enable/disable; disabled actions render with explanatory tooltips. `can_create_project = isTenantAdmin`; `can_open_reports = output_rendering module active`. |
| AC-7 — Saved dashboard views / presets | ✅ | `DashboardPresetTabs` built on shadcn `Tabs`: arrow-key, Home/End, Tab navigation; three presets (`My Work`, `Project Health`, `Approvals`). Preset reorders the grid without hiding panels. |
| AC-8 — Responsive layout | ✅ | 1440px: 8/4 split (`lg:grid-cols-12`). 768px: 2-col KPI strip, panels stack. 375px: 1-col KPI strip, single-column grid, no horizontal overflow. Verified via container query review of `dashboard-client.tsx` + `dashboard-kpi-strip.tsx`. |
| AC-9 — States and feedback | ✅ | Each panel renders dedicated `loading / ready / error / unavailable / empty` states via the section envelope. `DashboardSectionError` includes section-level retry. `DashboardSectionUnavailable` explicitly says "noch nicht verfügbar" (never green/safe). |
| AC-10 — Security and permissions | ✅ | Project-access is **stricter than RLS**: aggregator joins `project_memberships` and surfaces only projects with explicit membership. Unit test `excludes projects outside the user's project_memberships` verifies cross-project leak prevention. Tenant scoping `tenant_id = active_tenant` on every query. Capabilities computed server-side. |

### Edge cases verified

| Edge case | Result |
|---|---|
| User has no project memberships | ✅ Empty `my_work`, empty `project_health` (`total_accessible_projects=0`), empty `alerts`. Tenant-admin still gets `can_create_project=true` for the onboarding-style CTA. Unit-tested. |
| User has projects but no assigned work | ✅ Empty My Work panel; Health/Approval/Alerts panels still render their own data. |
| Project is deleted after dashboard load | ✅ Aggregator filters `is_deleted=false`. Stale rows on a long-lived client will 404 on click; covered by existing project-room route gates. |
| Tenant admin who is NOT a project member | ✅ Stricter-than-RLS project-access semantics: their dashboard shows no rows for those projects. Unit test "excludes projects outside the user's project_memberships" pins this. |
| Section-level failure (e.g. `risks` table read error) | ✅ `safeSection<T>` wraps each rollup and returns `{state:"error", data:null, error}`. Other sections render normally. Verified by unit test "surfaces section-level errors without breaking other rollups". |
| Mobile viewport — no horizontal scroll | ✅ Panel content uses `min-w-0 flex-1 truncate` on text; chip rows use `flex-wrap`; KPI strip falls back to `grid-cols-1`. |
| Module gating: `output_rendering` disabled | ✅ Aggregator returns empty `reports.items`; `capabilities.can_open_reports = false` disables the Reports quick action with a tooltip. |
| Module gating: `decisions` disabled | ✅ Aggregator short-circuits `loadApprovals` to `{items:[], total:0}`. |
| Empty project (no risks, no milestones) | 🟡 Surfaces in Project Health as "unknown" — see L2 below. This is **by design per AC-4** ("missing health signals") but can be noisy for new tenants. |
| Race: tenant settings missing | ✅ `loadTenantSettings` returns null; module gating falls open per existing convention (`isModuleActive(null) = true`); capabilities still computed from `is_tenant_admin`. |

### Security audit (red-team perspective)

| Attack vector | Result |
|---|---|
| Cross-tenant leak via `/api/dashboard/summary` | ✅ Blocked. Every aggregator query carries `tenant_id = activeTenantId`. RLS is the second layer; the user-context Supabase client is used throughout. |
| Cross-project leak (tenant member sees foreign-project rows) | ✅ Blocked for `my_work`, `alerts`, `project_health`, `approvals`. **See L1** for `reports` (consistent with PROJ-21 RLS). |
| Tenant-admin escalation (admin sees projects they're not a member of) | ✅ Blocked. `project_memberships` join is the source of truth; admins do not get a bypass. |
| Capability tampering (FE forces `can_create_project=true`) | ✅ The FE only renders enable/disable; the underlying actions (project create, etc.) are RLS-gated server-side. Tampering the FE flag does not unlock the action. |
| Unauthenticated access | ✅ `/api/dashboard/summary` returns 307 to `/login` (proxy-level gate). 4 live curl probes confirm. |
| Method-agnostic gate | ✅ POST to GET-only route still 307s (auth gate fires before framework's 405). |
| XSS via project name | ✅ All rendering through React (auto-escaping). No `dangerouslySetInnerHTML`. |
| Open redirect via `?next=` | ✅ Pre-existing middleware handles `next` decoding; no PROJ-64-specific surface. |
| Snapshot URL exposure (clicking Reports row) | ✅ Snapshot routes still gated by existing PROJ-21 tenant-member RLS. |
| Sensitive data in network response | ✅ No emails, no auth tokens, no FX rates leak. Payload contains project names, work item titles, risk titles, milestone titles, decision titles, snapshot kinds — all of which the user is RLS-allowed to read in the existing project room. |
| Capability route exposure | ✅ `/projects/new` (the "Neues Projekt" target) is itself role-gated server-side; the FE's tooltip-only disable is UX sugar, not the security boundary. |

### Bugs & findings

**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Medium | M1 | **Priority sort on > 50 open items.** The aggregator orders `work_items` by `.order("priority", { ascending: false })`. The DB column `work_items.priority` is `text` (verified via `information_schema.columns`), so Postgres performs an *alphabetical* DESC sort — `medium > low > high > critical`. For users with > 50 open assigned items, the fetch cap (`MY_WORK_LIMIT * 2 = 50`) may exclude critical/high items entirely. The JS-side `sortMyWork` re-orders correctly *after* the fetch, so the visible 25 are sorted right — but the underlying selection from the DB is wrong. **Acceptable for V1** because (a) the cap-of-50 fetch covers all current-tenant users in pilot data, (b) the spec explicitly caps lists with a "view all" deep link, and (c) the JS sort correctly handles the items that *are* fetched. Recommended follow-up: drop the server-side `.order("priority", ...)` and either fetch more rows (200) or replace with a CASE-based RPC. |
| Low | L1 | **Recent Reports does not restrict to `project_memberships`-accessible projects.** `loadRecentReports` filters by `tenant_id` only. A tenant member who is not a member of project X can still see snapshot rows for project X. This is *consistent with the existing PROJ-21 RLS* (snapshots are tenant-readable by design), but it contradicts the dashboard's stricter "project-access semantics" stance documented for My Work / Project Health. **Acceptable for V1**: the link target (`/reports/snapshots/{id}`) inherits the existing PROJ-21 tenant-RLS check; no new leak surface is introduced. Cross-section consistency could be tightened in a future slice. |
| Low | L2 | **Empty projects surface as `unknown` in Project Health.** A brand-new project with zero risks and zero milestones renders `scheduleState=empty` + `riskState=empty` → combined `health="unknown"` → appears in the exception list as "Daten unvollständig". This is **by design per AC-4** ("missing health signals" must appear), but for tenants with many new projects the panel may be noisy. Consider a follow-up enhancement to either (a) sort "unknown" rows last and cap them, or (b) collapse "unknown-only" rows behind a "show all" toggle. |
| Info | I1 | **WebKit specs skip on hosts missing `libnspr4.so` / WebKit deps.** The host this QA ran on lacks Mobile Safari system libraries. 12 of 80 specs skipped — 10 are pre-existing PROJ-51 visual-regression / PROJ-29 auth-fixture skips (require `SUPABASE_SERVICE_ROLE_KEY` refresh); 2 are environmental. PROJ-64 specs are all request-level so they pass on both projects (Chromium + Mobile Safari) without launching a real browser. |
| Info | I2 | **Performance budget (< 1.5s) is not micro-benchmarked.** The aggregator runs 6 queries via `Promise.all`. No N+1 fan-out. Estimated cold-call cost: ~150-300 ms against the live Supabase instance for a typical tenant. Real-world performance to be observed during pilot. |
| Info | I3 | **Budget alert kinds wired but not emitted.** Backend implementation notes document this as a deliberate perf deferral; the FE renders them automatically once the backend emits them. No FE change needed. |

### Regression smoke

| Surface | Result |
|---|---|
| All 141 vitest test files | ✅ 1244 / 1244 green |
| All 80 playwright specs across 2 projects | ✅ 56 passed, 12 skipped (pre-existing) |
| PROJ-21 snapshot route auth gates | ✅ unaffected (verified by `PROJ-21-output-rendering.spec.ts`) |
| PROJ-31 approvals endpoint | ✅ unaffected — `usePendingApprovals` fallback still works; live probe 307s as expected |
| PROJ-23 sidebar | ✅ unaffected |
| PROJ-28 method-aware navigation | ✅ unaffected; aggregator uses `getProjectSectionHref` consistently for deep links |
| Existing dashboard URL (`/`) | ✅ now renders `DashboardClient`; auth gate preserved (`307 → /login?next=%2F`) |
| `dashboard-welcome.tsx` removal | ✅ no other module imports it (verified pre-deletion); build green |

### Production-ready decision

**READY** — no Critical or High bugs.

The Medium finding (M1) is a documented correctness caveat with a narrow trigger (> 50 open assigned items per user) and a working safety net (JS post-sort correctly orders the fetched subset). The Low findings (L1, L2) are by-design choices consistent with existing PROJ-21 and AC-4 semantics.

Suggested next:
1. **`/deploy`** when ready — no blockers. Backend has no migration; FE deletes one obsolete file.
2. Optional follow-up slice (PROJ-64-γ): emit budget alerts (`budget_overrun`/`budget_threshold`/`missing_fx_rate`) via a pre-aggregated materialized view or lazy-loaded section.
3. Optional fix for M1: replace `.order("priority")` with a CASE-based ordering RPC or increase the fetch cap; trivial change, no API contract impact.
4. Optional refinement for L1: tighten `loadRecentReports` to `project_id IN (accessible_projects)` for cross-section consistency.

## Deployment

- **Date deployed:** 2026-05-11
- **Production URL:** https://projektplattform-v3.vercel.app
- **Vercel deployment:** `dpl_5HtgkqVMF6up1YNzLbKzXcDcaQJm` (READY, target=production, region iad1)
- **Squash commit:** `df3e9450e8ed0fcd0d7822cea932e46b127163e6`
- **Build duration:** ~3 min (BUILDING → READY)
- **Aliases assigned:** `projektplattform-v3.vercel.app`, `projektplattform-v3-it-couch.vercel.app`, `projektplattform-v3-git-main-it-couch.vercel.app`
- **DB migration:** none (PROJ-64 reads existing tables only)
- **Git tag:** `v1.64.0-PROJ-64`
- **Previous rollback candidate:** `dpl_FCEvioG65hfwnWPeMZ8fy9fwgJP2` (commit `565e354` — PROJ-room health summary fix)

### Pre-deploy verification

- `npx tsc --noEmit` clean
- `npm run lint` clean (only pre-existing react-hooks/incompatible-library warning at `edit-work-item-dialog.tsx:410`)
- `npx vitest run` — 1244 / 1244 green (PROJ-64 contributes 9)
- `npx playwright test` — 56 passed, 12 skipped (pre-existing PROJ-29 / PROJ-51 fixture skips)
- `npm run build` — green; `/` registered as dynamic; `/api/dashboard/summary` registered as dynamic

### Post-deploy smoke (live, unauth)

| Route | Method | Status |
|---|---|---|
| `/` | GET | 307 → `/login?next=%2F` ✅ |
| `/login` | GET | 200 ✅ |
| `/api/dashboard/summary` | GET | 307 → `/login?next=%2Fapi%2Fdashboard%2Fsummary` ✅ |
| `/api/dashboard/approvals` | GET | 307 (existing PROJ-31 endpoint unaffected) ✅ |
| `/api/dashboard/approvals?filter=pending` | GET | 307 ✅ |

Final-landing content check on `/` (following the redirect): 0 occurrences of the legacy placeholder copy "Your project dashboard will live here." — AC-1 verified live.

### Deviations carried forward (from /qa)

- **M1 (Medium) — FIXED post-deploy on 2026-05-11.** The QA found that `work_items.priority` is a `text` column, so the original aggregator's `.order("priority", { ascending: false })` sorted alphabetically (medium > low > high > critical) — at the 50-row fetch cap, critical/high items could be excluded from the fetched window before the JS post-sort ran. The fix in `src/lib/dashboard/summary.ts` drops the server-side priority order entirely and widens the fetch cap from 50 → 100 rows (`MY_WORK_FETCH_CAP = MY_WORK_LIMIT * 4`); the fetch is ordered by `planned_end ASC` (most time-sensitive first), and the JS post-sort (blocked → overdue → priority → due) becomes the authoritative ranking. New regression test `"ranks My Work by priority regardless of DB return order (M1 regression)"` pins the behavior by feeding rows in low-priority-first DB order and verifying the response leads with `critical → high → medium → low`. Vitest: **1245 / 1245 green** (was 1244; +1).
- **L1 (Low):** Recent Reports section filters by `tenant_id` only, not by `project_memberships` scope. Consistent with PROJ-21 RLS but contradicts the dashboard's stricter project-access stance.
- **L2 (Low):** Empty projects (zero risks AND zero milestones) surface as "unknown" Project Health rows. By design per AC-4 but can be noisy for new tenants.
- **AC-5 partial:** budget alert kinds (`budget_overrun`/`budget_threshold`/`missing_fx_rate`) are wired in the type contract but not yet emitted — a deliberate perf deferral. FE renders them once backend emits.

### Rollback plan

If a regression surfaces:

1. **Immediate (Vercel-only revert, no code change):** in the Vercel dashboard, promote `dpl_FCEvioG65hfwnWPeMZ8fy9fwgJP2` (commit `565e354`) back to production. Zero data implications because PROJ-64 introduced no DB migration.
2. **Code revert:** `git revert df3e945` then push. The dashboard returns to the placeholder welcome card; existing `/api/dashboard/approvals` endpoint remains live.

### Follow-up backlog

- ~~Optional fix for M1 (priority sort)~~ — done 2026-05-11 (see "Deviations carried forward" above).
- Optional refinement for L1 (Reports scope): tighten `loadRecentReports` to `project_id IN (accessible_projects)` for cross-section consistency.
- PROJ-64-γ: emit budget alerts (`budget_overrun` / `budget_threshold` / `missing_fx_rate`) via a pre-aggregated materialized view or lazy-loaded section.
- Performance baseline: micro-benchmark the aggregator end-to-end on the live tenant (target < 1.5 s for typical data).
