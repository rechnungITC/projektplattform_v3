import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getJiraExportJob,
  getJiraMapping,
  previewJiraExport,
  saveJiraMapping,
  startJiraExport,
} from "./api"
import { defaultJiraFieldMapping } from "./mapping"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("Jira API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads and saves project Jira mapping through the project routes", async () => {
    const mapping = defaultJiraFieldMapping("ABC")
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ mapping }))
      .mockResolvedValueOnce(jsonResponse({ mapping: { ...mapping, labels: ["v3"] } }))
    vi.stubGlobal("fetch", fetchSpy)

    await expect(getJiraMapping("project-1")).resolves.toEqual(mapping)
    await expect(
      saveJiraMapping("project-1", { ...mapping, labels: ["v3"] })
    ).resolves.toEqual({ ...mapping, labels: ["v3"] })

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/jira/mapping",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/jira/mapping",
      expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...mapping, labels: ["v3"] }),
      })
    )
  })

  it("runs preview, export, and job detail calls with selected work item ids", async () => {
    const preview = { mapping: defaultJiraFieldMapping("ABC"), items: [] }
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preview))
      .mockResolvedValueOnce(
        jsonResponse({ job_id: "job-1", status: "succeeded" })
      )
      .mockResolvedValueOnce(jsonResponse({ job: { id: "job-1" }, log: [] }))
    vi.stubGlobal("fetch", fetchSpy)

    await expect(previewJiraExport("project-1", ["wi-1"])).resolves.toEqual(
      preview
    )
    await expect(startJiraExport("project-1", ["wi-1"])).resolves.toEqual({
      job_id: "job-1",
      status: "succeeded",
    })
    await expect(getJiraExportJob("project-1", "job-1")).resolves.toEqual({
      job: { id: "job-1" },
      log: [],
    })

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/jira/export/preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ work_item_ids: ["wi-1"] }),
      })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/jira/export",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ work_item_ids: ["wi-1"] }),
      })
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      "/api/projects/project-1/jira/export/jobs/job-1",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    )
  })

  it("surfaces API error messages without exposing raw response details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "jira_unconfigured", message: "Jira ist nicht konfiguriert." } },
          400
        )
      )
    )

    await expect(getJiraMapping("project-1")).rejects.toThrow(
      "Jira ist nicht konfiguriert."
    )
  })
})
