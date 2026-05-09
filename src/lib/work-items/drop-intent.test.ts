import { describe, expect, it } from "vitest"

import {
  PARENT_NONE_DROP_ID,
  SPRINT_BACKLOG_DROP_ID,
  parentDropId,
  parseWorkItemDropIntent,
  sprintDropId,
  sprintItemDropId,
  statusDropId,
} from "./drop-intent"

describe("work-item drop intent parsing — PROJ-59β", () => {
  it("parses explicit status drops", () => {
    expect(parseWorkItemDropIntent(statusDropId("in_progress"))).toEqual({
      type: "status",
      status: "in_progress",
    })
  })

  it("rejects legacy raw status IDs as unknown", () => {
    expect(parseWorkItemDropIntent("in_progress")).toEqual({
      type: "unknown",
      raw: "in_progress",
    })
  })

  it("parses sprint assignment targets", () => {
    expect(parseWorkItemDropIntent(sprintDropId("sprint-1"))).toEqual({
      type: "sprint",
      sprintId: "sprint-1",
    })
    expect(
      parseWorkItemDropIntent(sprintItemDropId("sprint-1", "work-item-1"))
    ).toEqual({
      type: "sprint-item",
      sprintId: "sprint-1",
      workItemId: "work-item-1",
    })
    expect(parseWorkItemDropIntent(SPRINT_BACKLOG_DROP_ID)).toEqual({
      type: "sprint-backlog",
    })
  })

  it("parses parent hierarchy targets", () => {
    expect(parseWorkItemDropIntent(parentDropId("story-1"))).toEqual({
      type: "parent",
      parentId: "story-1",
    })
    expect(parseWorkItemDropIntent(PARENT_NONE_DROP_ID)).toEqual({
      type: "parent-none",
    })
  })

  it("keeps malformed typed IDs unknown", () => {
    expect(parseWorkItemDropIntent("status:not-a-status")).toEqual({
      type: "unknown",
      raw: "status:not-a-status",
    })
    expect(parseWorkItemDropIntent("sprint:")).toEqual({
      type: "unknown",
      raw: "sprint:",
    })
    expect(parseWorkItemDropIntent("sprint-item:only-sprint")).toEqual({
      type: "unknown",
      raw: "sprint-item:only-sprint",
    })
    expect(parseWorkItemDropIntent("parent:")).toEqual({
      type: "unknown",
      raw: "parent:",
    })
  })
})
