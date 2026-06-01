import { describe, expect, it, vi } from "vitest"

import {
  buildJiraIssuePayload,
  JiraCredentialsSchema,
  jiraIssueUrl,
  sanitizeJiraError,
  testJiraConnection,
} from "./client"

describe("Jira client", () => {
  it("normalizes credentials before storage/use", () => {
    const parsed = JiraCredentialsSchema.parse({
      base_url: "https://example.atlassian.net/",
      email: "admin@example.com",
      api_token: "0123456789abcdef",
      default_project_key: "abc",
    })
    expect(parsed.base_url).toBe("https://example.atlassian.net")
    expect(parsed.default_project_key).toBe("ABC")
  })

  it("redacts auth material from errors", () => {
    expect(
      sanitizeJiraError(
        "failed with Basic abc123 api_token=secret password=hunter2"
      )
    ).not.toMatch(/abc123|secret|hunter2/)
  })

  it("tests Jira connection through /myself without leaking credentials", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ accountId: "abc" }, { status: 200 })
    ) as unknown as typeof fetch
    const health = await testJiraConnection(
      {
        base_url: "https://example.atlassian.net",
        email: "admin@example.com",
        api_token: "0123456789abcdef",
        default_project_key: "ABC",
      },
      fetchImpl
    )
    expect(health.status).toBe("adapter_ready_configured")
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.atlassian.net/rest/api/3/myself",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    )
  })

  it("builds Jira v3 issue payloads with ADF description", () => {
    const payload = buildJiraIssuePayload({
      projectKey: "ABC",
      issueType: "Task",
      summary: "Export me",
      description: "Details",
      priority: "High",
      labels: ["v3-export"],
    })
    expect(payload).toMatchObject({
      fields: {
        project: { key: "ABC" },
        issuetype: { name: "Task" },
        summary: "Export me",
        priority: { name: "High" },
        labels: ["v3-export"],
      },
    })
    expect(payload.fields.description).toMatchObject({
      type: "doc",
      version: 1,
    })
  })

  it("builds browser URLs for exported issues", () => {
    expect(
      jiraIssueUrl({ base_url: "https://example.atlassian.net" }, "ABC-12")
    ).toBe("https://example.atlassian.net/browse/ABC-12")
  })
})
