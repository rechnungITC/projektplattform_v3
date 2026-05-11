"use client"

import * as React from "react"

import { useDashboard } from "@/hooks/use-dashboard"
import { usePendingApprovals } from "@/hooks/use-pending-approvals"
import {
  emptyEnvelope,
  type ApprovalRow,
  type DashboardPreset,
  type DashboardSectionEnvelope,
} from "@/types/dashboard"
import type { PendingApprovalSummary } from "@/types/decision-approval"

import { ApprovalInboxPanel } from "./approval-inbox-panel"
import { BudgetRiskAlertsPanel } from "./budget-risk-alerts-panel"
import { DashboardHeader } from "./dashboard-header"
import { DashboardKpiStrip } from "./dashboard-kpi-strip"
import { DashboardPresetTabs } from "./dashboard-preset-tabs"
import { MyWorkPanel } from "./my-work-panel"
import { ProjectHealthExceptionsPanel } from "./project-health-exceptions-panel"
import { RecentReportsPanel } from "./recent-reports-panel"

/**
 * PROJ-64 — Global Dashboard / My Work Inbox.
 *
 * Replaces the placeholder welcome card on `/`. The page is built
 * around three preset tabs (My Work / Project Health / Approvals)
 * and a responsive grid of section panels. Each panel renders its
 * own loading / error / unavailable / empty / populated state so
 * one failed rollup does not blank the page.
 *
 * Backend dependency:
 *   GET /api/dashboard/summary    → primary aggregation (PROJ-64-β)
 *   GET /api/dashboard/approvals  → already shipped (PROJ-31)
 *
 * While the aggregation endpoint is pending, the page still
 * renders the shell and uses the existing approvals endpoint so
 * the most actionable surface (genehmigungspflichtige Decisions)
 * is functional from day one.
 */
export function DashboardClient() {
  const {
    summary,
    isLoading,
    error,
    backendPending,
    refresh,
    refreshSection,
  } = useDashboard()

  // Use the global summary's approvals envelope when it's ready —
  // that saves a round-trip. The dedicated `/api/dashboard/approvals`
  // endpoint stays as a fallback for the case where the summary
  // route fails or the approvals section degraded to 'error'.
  const summaryApprovalsReady = summary?.approvals.state === "ready"
  const approvalsHook = usePendingApprovals({ enabled: !summaryApprovalsReady })

  const approvalsForPanel: PendingApprovalSummary[] | null = summaryApprovalsReady
    ? (summary?.approvals.data?.items ?? []).map(approvalRowToSummary)
    : approvalsHook.approvals
  const approvalsLoading =
    summaryApprovalsReady ? false : approvalsHook.isLoading
  const approvalsError = summaryApprovalsReady ? null : approvalsHook.error

  const [preset, setPreset] = React.useState<DashboardPreset>("my_work")

  const approvalsCount = approvalsForPanel?.length ?? 0

  const kpis = React.useMemo(() => {
    if (!summary) return null
    // Surface the live approvals count from the dedicated hook
    // so the strip is correct even when the summary endpoint is
    // still 'unavailable'.
    return {
      ...summary.kpis,
      pending_approvals: approvalsCount,
    }
  }, [summary, approvalsCount])

  const refreshAll = React.useCallback(async () => {
    // Always re-pull the summary; the approvals fallback hook
    // refresh is a no-op when the summary owns that section.
    await Promise.all([refresh(), approvalsHook.refresh()])
  }, [refresh, approvalsHook])

  const myWorkEnv = summary?.my_work ?? emptyEnvelope("loading")
  const healthEnv = summary?.project_health ?? emptyEnvelope("loading")
  const alertsEnv = summary?.alerts ?? emptyEnvelope("loading")
  const reportsEnv = summary?.reports ?? emptyEnvelope("loading")

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <DashboardHeader
        onRefresh={refreshAll}
        isRefreshing={isLoading || approvalsHook.isLoading}
        capabilities={
          summary?.capabilities ?? {
            can_create_project: false,
            can_create_work_item: false,
            can_open_approvals: true,
            can_open_reports: false,
          }
        }
      />

      {error && !backendPending && (
        <DashboardErrorBanner message={error} onRetry={refreshAll} />
      )}
      {backendPending && <DashboardBackendPendingBanner />}

      <DashboardKpiStrip kpis={kpis} isLoading={isLoading} />

      <DashboardPresetTabs value={preset} onChange={setPreset} />

      <DashboardGrid
        preset={preset}
        myWorkEnv={myWorkEnv}
        healthEnv={healthEnv}
        alertsEnv={alertsEnv}
        reportsEnv={reportsEnv}
        approvals={approvalsForPanel}
        approvalsLoading={approvalsLoading}
        approvalsError={approvalsError}
        onSectionRetry={(section) => {
          if (section === "approvals" && !summaryApprovalsReady) {
            return approvalsHook.refresh()
          }
          return refreshSection(section)
        }}
        isLoading={isLoading}
      />
    </div>
  )
}

interface DashboardGridProps {
  preset: DashboardPreset
  myWorkEnv: DashboardSectionEnvelope<{
    items: import("@/types/dashboard").MyWorkRow[]
    total: number
    capped: boolean
  }>
  healthEnv: DashboardSectionEnvelope<{
    items: import("@/types/dashboard").ProjectHealthExceptionRow[]
    total_accessible_projects: number
  }>
  alertsEnv: DashboardSectionEnvelope<{
    items: import("@/types/dashboard").AlertRow[]
  }>
  reportsEnv: DashboardSectionEnvelope<{
    items: import("@/types/dashboard").ReportShortcut[]
  }>
  approvals: PendingApprovalSummary[] | null
  approvalsLoading: boolean
  approvalsError: string | null
  isLoading: boolean
  onSectionRetry: (
    section:
      | "my_work"
      | "approvals"
      | "project_health"
      | "alerts"
      | "reports",
  ) => void | Promise<void>
}

/**
 * Layout strategy per Tech Design § Frontend Design.
 *
 * The preset reorders panels but never hides them entirely —
 * "Project Health" + "Approvals" presets simply foreground the
 * matching panel. This keeps the muscle memory consistent and
 * lets the user glance at the other panels without switching
 * tabs.
 *
 * Mobile: panels stack in priority order per preset.
 * Tablet: 2-column where reasonable.
 * Desktop: 8/4 split with the dominant column on the left.
 */
function DashboardGrid({
  preset,
  myWorkEnv,
  healthEnv,
  alertsEnv,
  reportsEnv,
  approvals,
  approvalsLoading,
  approvalsError,
  isLoading,
  onSectionRetry,
}: DashboardGridProps) {
  const myWork = (
    <MyWorkPanel
      envelope={myWorkEnv}
      isLoading={isLoading}
      onRetry={() => onSectionRetry("my_work")}
    />
  )
  const approvalsPanel = (
    <ApprovalInboxPanel
      approvals={approvals}
      isLoading={approvalsLoading}
      error={approvalsError}
      onRetry={() => onSectionRetry("approvals")}
    />
  )
  const health = (
    <ProjectHealthExceptionsPanel
      envelope={healthEnv}
      isLoading={isLoading}
      onRetry={() => onSectionRetry("project_health")}
    />
  )
  const alerts = (
    <BudgetRiskAlertsPanel
      envelope={alertsEnv}
      isLoading={isLoading}
      onRetry={() => onSectionRetry("alerts")}
    />
  )
  const reports = (
    <RecentReportsPanel
      envelope={reportsEnv}
      isLoading={isLoading}
      onRetry={() => onSectionRetry("reports")}
    />
  )

  if (preset === "approvals") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {approvalsPanel}
          {alerts}
        </div>
        <div className="space-y-4 lg:col-span-4">
          {myWork}
          {reports}
        </div>
      </div>
    )
  }

  if (preset === "project_health") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {health}
          {alerts}
        </div>
        <div className="space-y-4 lg:col-span-4">
          {approvalsPanel}
          {reports}
        </div>
      </div>
    )
  }

  // Default: My Work
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-8">
        {myWork}
        {alerts}
      </div>
      <div className="space-y-4 lg:col-span-4">
        {approvalsPanel}
        {health}
        {reports}
      </div>
    </div>
  )
}

function DashboardErrorBanner({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void | Promise<void>
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
      role="alert"
    >
      <span className="font-medium">Dashboard konnte nicht geladen werden:</span>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => {
          void onRetry()
        }}
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        Neu laden
      </button>
    </div>
  )
}

function approvalRowToSummary(row: ApprovalRow): PendingApprovalSummary {
  return {
    decision_id: row.decision_id,
    decision_title: row.decision_title,
    project_id: row.project_id,
    project_name: row.project_name,
    approver_id: row.approver_id,
    magic_link_expires_at: null,
    submitted_at: row.submitted_at,
    deadline_at: row.deadline_at,
    approval_status: row.status,
  }
}

function DashboardBackendPendingBanner() {
  return (
    <div
      className="rounded-md border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
      role="status"
    >
      <strong className="font-medium">Hinweis:</strong> Die globale
      Dashboard-Aggregation wird mit der PROJ-64 Backend-Slice freigeschaltet.
      Genehmigungen sind bereits live; die übrigen Sektionen werden
      Platzhalter anzeigen, bis der API-Endpunkt deployed ist.
    </div>
  )
}
