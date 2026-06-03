import { describe, expect, it, vi } from "vitest"

import { createJiraExportPreview, runJiraExportJob } from "./export-service"

const TENANT_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"

function chain(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

function makeSupabase() {
  const mapping = chain({ data: null, error: null })
  const workItems = chain({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        kind: "story",
        title: "Story export",
        description: "Details",
        status: "todo",
        priority: "high",
        responsible_user_id: null,
        responsible: null,
        is_deleted: false,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        kind: "unknown",
        title: "Unsupported export",
        description: null,
        status: "todo",
        priority: "medium",
        responsible_user_id: null,
        responsible: null,
        is_deleted: false,
      },
    ],
    error: null,
  })
  const refs = chain({
    data: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        entity_id: "33333333-3333-4333-8333-333333333333",
        external_key: "ABC-1",
        external_url: "https://example.atlassian.net/browse/ABC-1",
      },
    ],
    error: null,
  })

  return {
    from: vi.fn((table: string) => {
      if (table === "jira_field_mappings") return mapping
      if (table === "work_items") return workItems
      if (table === "external_refs") return refs
      throw new Error(`unexpected table ${table}`)
    }),
  } as never
}

describe("createJiraExportPreview", () => {
  it("marks existing refs as update and unsupported kinds as skip", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        transitions: [{ id: "11", name: "To Do", to: { name: "To Do" } }],
      })
    ) as unknown as typeof fetch

    const preview = await createJiraExportPreview(makeSupabase(), {
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      credentials: {
        base_url: "https://example.atlassian.net",
        email: "admin@example.com",
        api_token: "0123456789abcdef",
        default_project_key: "ABC",
      },
      scope: {
        work_item_ids: [
          "33333333-3333-4333-8333-333333333333",
          "44444444-4444-4444-8444-444444444444",
          "66666666-6666-4666-8666-666666666666",
        ],
      },
      fetchImpl,
    })

    expect(preview.mapping.jira_project_key).toBe("ABC")
    expect(preview.items).toHaveLength(3)
    expect(preview.items[0]).toMatchObject({
      work_item_id: "33333333-3333-4333-8333-333333333333",
      action: "update",
      jira_issue_key: "ABC-1",
    })
    expect(preview.items[1]).toMatchObject({
      work_item_id: "44444444-4444-4444-8444-444444444444",
      action: "skip",
    })
    expect(preview.items[1].warnings[0]).toMatch(/Issue-Type-Mapping/)
    expect(preview.items[2]).toMatchObject({
      work_item_id: "66666666-6666-4666-8666-666666666666",
      action: "skip",
      title: "(not found)",
    })
  })
})

function makeExportSupabase() {
  const mapping = chain({
    data: {
      jira_project_key: "ABC",
      issue_type_map: { story: "Story" },
      status_map: { done: "Done" },
      priority_map: { high: "High" },
      labels: ["v3-export"],
      assignee_mode: "responsible_user_email",
    },
    error: null,
  })
  const workItems = chain({
    data: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        kind: "story",
        title: "Story export",
        description: "Details",
        status: "done",
        priority: "high",
        responsible_user_id: "77777777-7777-4777-8777-777777777777",
        responsible: {
          id: "77777777-7777-4777-8777-777777777777",
          email: "owner@example.com",
          display_name: "Owner",
        },
        is_deleted: false,
      },
    ],
    error: null,
  })
  const refs = {
    ...chain({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  }
  const jobs = {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "88888888-8888-4888-8888-888888888888" },
          error: null,
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  }
  const logRows: unknown[] = []
  const logs = {
    insert: vi.fn(async (row: unknown) => {
      logRows.push(row)
      return { error: null }
    }),
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "jira_field_mappings") return mapping
      if (table === "work_items") return workItems
      if (table === "external_refs") return refs
      if (table === "jira_export_jobs") return jobs
      if (table === "jira_export_log") return logs
      throw new Error(`unexpected table ${table}`)
    }),
  } as never

  return { supabase, refs, logRows }
}

describe("runJiraExportJob", () => {
  it("applies status transitions and assignees only after a clear Jira resolution", async () => {
    const { supabase, refs, logRows } = makeExportSupabase()
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = String(url)
      if (href.includes("/user/assignable/search")) {
        return Response.json([
          {
            accountId: "acc-1",
            emailAddress: "owner@example.com",
            displayName: "Owner",
            active: true,
          },
        ])
      }
      if (href.endsWith("/rest/api/3/issue") && init?.method === "POST") {
        return Response.json({ key: "ABC-2" })
      }
      if (href.endsWith("/rest/api/3/issue/ABC-2/transitions")) {
        if (init?.method === "POST") return new Response(null, { status: 204 })
        return Response.json({
          transitions: [{ id: "31", name: "Done", to: { name: "Done" } }],
        })
      }
      if (href.endsWith("/rest/api/3/issue/ABC-2/assignee")) {
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected Jira call ${href}`)
    }) as unknown as typeof fetch

    await expect(
      runJiraExportJob(supabase, {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        actorUserId: "99999999-9999-4999-8999-999999999999",
        credentials: {
          base_url: "https://example.atlassian.net",
          email: "admin@example.com",
          api_token: "0123456789abcdef",
          default_project_key: "ABC",
        },
        scope: {
          work_item_ids: ["33333333-3333-4333-8333-333333333333"],
        },
        fetchImpl,
      })
    ).resolves.toEqual({
      job_id: "88888888-8888-4888-8888-888888888888",
      status: "succeeded",
    })

    expect(refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        external_key: "ABC-2",
        external_url: "https://example.atlassian.net/browse/ABC-2",
      }),
      { onConflict: "tenant_id,provider,entity_type,entity_id" }
    )
    expect(logRows[0]).toMatchObject({
      result: "created",
      jira_issue_key: "ABC-2",
      sanitized_error: null,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/ABC-2/transitions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ transition: { id: "31" } }),
      })
    )
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/issue/ABC-2/assignee",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ accountId: "acc-1" }),
      })
    )
  })
})
