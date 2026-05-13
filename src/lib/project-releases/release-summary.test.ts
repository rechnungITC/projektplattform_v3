import { describe, expect, it } from "vitest"

import {
  buildReleaseSummary,
  filterReleaseScopeItems,
  type ReleaseRow,
  type ReleaseSummarySprint,
  type ReleaseSummaryWorkItem,
} from "./release-summary"

const release: ReleaseRow = {
  id: "release-1",
  project_id: "project-1",
  name: "R1",
  start_date: "2026-05-01",
  end_date: "2026-05-31",
  status: "active",
  target_milestone_id: null,
}

const sprint: ReleaseSummarySprint = {
  id: "sprint-1",
  name: "Sprint 1",
  state: "active",
  start_date: "2026-05-06",
  end_date: "2026-05-17",
}

function item(
  override: Partial<ReleaseSummaryWorkItem> & Pick<ReleaseSummaryWorkItem, "id">
): ReleaseSummaryWorkItem {
  return {
    id: override.id,
    kind: "story",
    parent_id: null,
    phase_id: null,
    milestone_id: null,
    sprint_id: null,
    release_id: null,
    title: override.id,
    status: "todo",
    priority: "medium",
    planned_start: null,
    planned_end: null,
    ...override,
  }
}

describe("PROJ-61 release summary", () => {
  it("includes child tasks/bugs under a release-scoped story", () => {
    const scopedStory = item({
      id: "story-1",
      release_id: release.id,
    })
    const childTask = item({
      id: "task-1",
      kind: "task",
      parent_id: scopedStory.id,
      release_id: null,
    })
    const unrelatedTask = item({
      id: "task-2",
      kind: "task",
      release_id: null,
    })

    expect(
      filterReleaseScopeItems([scopedStory, childTask, unrelatedTask], release.id)
        .map((row) => row.id)
    ).toEqual(["story-1", "task-1"])
  })

  it("uses own dates before sprint dates and flags outside-window items", () => {
    const summary = buildReleaseSummary({
      release,
      sprints: [sprint],
      workItems: [
        item({
          id: "story-own",
          release_id: release.id,
          planned_start: "2026-04-30",
          planned_end: "2026-05-03",
          sprint_id: sprint.id,
        }),
      ],
      today: "2026-05-10",
    })

    expect(summary.items[0]?.date_source).toBe("work_item")
    expect(summary.items[0]?.timeline_start).toBe("2026-04-30")
    expect(summary.items[0]?.outside_release_window).toBe(true)
    expect(summary.health.outside_window_items).toBe(1)
  })

  it("falls back to sprint dates and then parent story dates", () => {
    const parentStory = item({
      id: "story-1",
      release_id: release.id,
      sprint_id: sprint.id,
    })
    const childBug = item({
      id: "bug-1",
      kind: "bug",
      parent_id: parentStory.id,
      release_id: null,
    })

    const summary = buildReleaseSummary({
      release,
      sprints: [sprint],
      workItems: [parentStory, childBug],
      today: "2026-05-10",
    })

    const story = summary.items.find((row) => row.id === "story-1")
    const bug = summary.items.find((row) => row.id === "bug-1")
    expect(story?.date_source).toBe("sprint")
    expect(bug?.date_source).toBe("parent_story")
    expect(bug?.timeline_start).toBe("2026-05-06")
  })

  it("builds sprint contributions and health metrics", () => {
    const summary = buildReleaseSummary({
      release,
      sprints: [sprint],
      workItems: [
        item({
          id: "story-1",
          release_id: release.id,
          sprint_id: sprint.id,
          status: "done",
        }),
        item({
          id: "bug-1",
          kind: "bug",
          release_id: release.id,
          sprint_id: sprint.id,
          status: "blocked",
          priority: "critical",
        }),
        item({
          id: "task-1",
          kind: "task",
          release_id: release.id,
        }),
      ],
      today: "2026-06-01",
    })

    expect(summary.health.total_items).toBe(3)
    expect(summary.health.done_items).toBe(1)
    expect(summary.health.blocked_items).toBe(1)
    expect(summary.health.critical_items).toBe(1)
    expect(summary.health.unscheduled_items).toBe(1)
    expect(summary.sprint_contributions).toEqual([
      {
        sprint_id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        start_date: sprint.start_date,
        end_date: sprint.end_date,
        item_count: 2,
        done_count: 1,
        blocked_count: 1,
      },
    ])
  })
})
