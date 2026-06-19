/**
 * PROJ-48 — MCP server factory: 4 read-only, tenant-scoped tools.
 *
 *   project.lookup    — find projects by name/number within the tenant.
 *   project.status    — lifecycle + phase/milestone summary for one project.
 *   work_item.lookup  — backlog items (no assignee personal data).
 *   report.snapshot   — latest Status-Report / Executive-Summary metadata.
 *
 * Hard rules baked in here:
 *   - every query is tenant-scoped (explicit `.eq('tenant_id', …)`) — the route
 *     runs under the service-role client which bypasses RLS, so the filter is
 *     the only tenant boundary;
 *   - only `confidentiality_level = 'standard'` rows are emitted (PROJ-100a
 *     need-to-know defense — service-role bypasses the RESTRICTIVE gate);
 *   - soft-deleted rows are excluded;
 *   - every emitted row passes through `redactRows()` (Class-3 dropped);
 *   - tools SELECT an explicit safe-column projection — personal-data columns
 *     (responsible_user_id, generated_by, content) are never even fetched.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { DataClass } from "@/lib/ai/types"
import { redactRows } from "./redaction"

export interface McpToolStats {
  /** Total rows emitted across the call. */
  rowCount: number
  /** Total Class-3 field occurrences withheld. */
  redactionCount: number
}

export interface McpServerContext {
  tenantId: string
  /** Service-role client (RLS-bypassing) — tenant scoping is enforced here. */
  supabase: SupabaseClient
  /** Tenant privacy default for unknown fields (PROJ-17); 3 = safest. */
  tenantDefault?: DataClass
}

const SERVER_INFO = { name: "projektplattform-mcp", version: "1.0.0" } as const

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  }
}

/**
 * Build a tenant-scoped MCP server plus a mutable stats accumulator the route
 * reads after dispatch for the `mcp_tool_calls` audit row.
 */
export function buildMcpServer(ctx: McpServerContext): {
  server: McpServer
  stats: McpToolStats
} {
  const tenantDefault: DataClass = ctx.tenantDefault ?? 3
  const stats: McpToolStats = { rowCount: 0, redactionCount: 0 }
  const server = new McpServer(SERVER_INFO)

  const account = (rowCount: number, redactionCount: number) => {
    stats.rowCount += rowCount
    stats.redactionCount += redactionCount
  }

  /** Load a single project only if it is tenant-owned, live and `standard`. */
  const loadStandardProject = async (projectId: string) => {
    const { data } = await ctx.supabase
      .from("projects")
      .select("id, name, lifecycle_status, planned_start_date, planned_end_date")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", projectId)
      .eq("is_deleted", false)
      .eq("confidentiality_level", "standard")
      .maybeSingle()
    return (data as Record<string, unknown> | null) ?? null
  }

  // ─── project.lookup ────────────────────────────────────────────────────────
  server.registerTool(
    "project.lookup",
    {
      title: "Project lookup",
      description:
        "Find projects in the tenant by name or project number. Read-only.",
      inputSchema: {
        query: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ query, limit }) => {
      let q = ctx.supabase
        .from("projects")
        .select(
          "id, name, project_number, project_type, project_method, lifecycle_status, planned_start_date, planned_end_date",
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("is_deleted", false)
        .eq("confidentiality_level", "standard")
        .order("created_at", { ascending: false })
        .limit(limit ?? 20)
      if (query) q = q.or(`name.ilike.%${query}%,project_number.ilike.%${query}%`)

      const { data, error } = await q
      if (error) return textResult({ error: "lookup_failed" })
      const { rows, redactionCount, redactedFields } = redactRows(
        "projects",
        (data ?? []) as Record<string, unknown>[],
        tenantDefault,
      )
      account(rows.length, redactionCount)
      return textResult({ projects: rows, redaction: { count: redactionCount, fields: redactedFields } })
    },
  )

  // ─── project.status ────────────────────────────────────────────────────────
  server.registerTool(
    "project.status",
    {
      title: "Project status",
      description:
        "Lifecycle state plus phase and milestone summary for one project. Read-only.",
      inputSchema: { project_id: z.string().uuid() },
    },
    async ({ project_id }) => {
      const project = await loadStandardProject(project_id)
      if (!project) return textResult({ error: "not_found" })

      const { data: phaseData } = await ctx.supabase
        .from("phases")
        .select("id, name, status, sequence_number, planned_start, planned_end")
        .eq("tenant_id", ctx.tenantId)
        .eq("project_id", project_id)
        .eq("is_deleted", false)
        .eq("confidentiality_level", "standard")
        .order("sequence_number", { ascending: true })

      const { data: milestoneData } = await ctx.supabase
        .from("milestones")
        .select("id, name, status, target_date, actual_date")
        .eq("tenant_id", ctx.tenantId)
        .eq("project_id", project_id)
        .eq("is_deleted", false)
        .order("target_date", { ascending: true })

      const projRedaction = redactRows("projects", [project], tenantDefault)
      const phases = redactRows(
        "phases",
        (phaseData ?? []) as Record<string, unknown>[],
        tenantDefault,
      )
      const milestones = redactRows(
        "milestones",
        (milestoneData ?? []) as Record<string, unknown>[],
        tenantDefault,
      )

      const countBy = (rows: Record<string, unknown>[]) =>
        rows.reduce<Record<string, number>>((acc, r) => {
          const s = String(r.status ?? "unknown")
          acc[s] = (acc[s] ?? 0) + 1
          return acc
        }, {})

      const redactionCount =
        projRedaction.redactionCount + phases.redactionCount + milestones.redactionCount
      account(1 + phases.rows.length + milestones.rows.length, redactionCount)

      return textResult({
        project: projRedaction.rows[0],
        phases: {
          total: phases.rows.length,
          by_status: countBy(phases.rows as Record<string, unknown>[]),
          items: phases.rows,
        },
        milestones: {
          total: milestones.rows.length,
          by_status: countBy(milestones.rows as Record<string, unknown>[]),
          items: milestones.rows,
        },
        redaction: { count: redactionCount },
      })
    },
  )

  // ─── work_item.lookup ──────────────────────────────────────────────────────
  server.registerTool(
    "work_item.lookup",
    {
      title: "Work item lookup",
      description:
        "Backlog items for a project (title, kind, status — no assignee personal data). Read-only.",
      inputSchema: {
        project_id: z.string().uuid(),
        kind: z.string().trim().max(40).optional(),
        status: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ project_id, kind, status, limit }) => {
      const project = await loadStandardProject(project_id)
      if (!project) return textResult({ error: "not_found" })

      let q = ctx.supabase
        .from("work_items")
        .select("id, kind, parent_id, wbs_code, title, status, priority")
        .eq("tenant_id", ctx.tenantId)
        .eq("project_id", project_id)
        .eq("is_deleted", false)
        .eq("confidentiality_level", "standard")
        .order("position", { ascending: true })
        .limit(limit ?? 50)
      if (kind) q = q.eq("kind", kind)
      if (status) q = q.eq("status", status)

      const { data, error } = await q
      if (error) return textResult({ error: "lookup_failed" })
      const { rows, redactionCount, redactedFields } = redactRows(
        "work_items",
        (data ?? []) as Record<string, unknown>[],
        tenantDefault,
      )
      account(rows.length, redactionCount)
      return textResult({ work_items: rows, redaction: { count: redactionCount, fields: redactedFields } })
    },
  )

  // ─── report.snapshot ───────────────────────────────────────────────────────
  server.registerTool(
    "report.snapshot",
    {
      title: "Report snapshot",
      description:
        "Latest rendered Status-Report / Executive-Summary metadata for a project (no document body). Read-only.",
      inputSchema: {
        project_id: z.string().uuid(),
        kind: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      },
    },
    async ({ project_id, kind, limit }) => {
      const project = await loadStandardProject(project_id)
      if (!project) return textResult({ error: "not_found" })

      let q = ctx.supabase
        .from("report_snapshots")
        .select(
          "id, project_id, kind, version, generated_at, pdf_status, ki_provider, ki_summary_classification",
        )
        .eq("tenant_id", ctx.tenantId)
        .eq("project_id", project_id)
        .order("generated_at", { ascending: false })
        .limit(limit ?? 5)
      if (kind) q = q.eq("kind", kind)

      const { data, error } = await q
      if (error) return textResult({ error: "lookup_failed" })
      const { rows, redactionCount, redactedFields } = redactRows(
        "report_snapshots",
        (data ?? []) as Record<string, unknown>[],
        tenantDefault,
      )
      account(rows.length, redactionCount)
      return textResult({ snapshots: rows, redaction: { count: redactionCount, fields: redactedFields } })
    },
  )

  return { server, stats }
}
