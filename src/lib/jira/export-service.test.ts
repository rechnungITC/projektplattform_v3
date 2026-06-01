import { describe, expect, it, vi } from "vitest"

import { createJiraExportPreview } from "./export-service"

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
