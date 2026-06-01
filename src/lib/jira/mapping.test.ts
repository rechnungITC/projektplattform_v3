import { describe, expect, it } from "vitest"

import {
  defaultJiraFieldMapping,
  JiraFieldMappingSchema,
} from "./mapping"

describe("Jira field mapping", () => {
  it("provides MVP defaults for all supported work item kinds", () => {
    const mapping = defaultJiraFieldMapping("ABC")
    expect(mapping.issue_type_map.story).toBe("Story")
    expect(mapping.issue_type_map.task).toBe("Task")
    expect(mapping.issue_type_map.bug).toBe("Bug")
    expect(mapping.priority_map.critical).toBe("Highest")
  })

  it("normalizes project keys and fills optional defaults", () => {
    const mapping = JiraFieldMappingSchema.parse({
      jira_project_key: "abc",
      issue_type_map: { story: "Story" },
      status_map: { todo: "To Do" },
      priority_map: { medium: "Medium" },
    })
    expect(mapping.jira_project_key).toBe("ABC")
    expect(mapping.labels).toEqual([])
    expect(mapping.assignee_mode).toBe("none")
  })
})
