import { describe, expect, it } from "vitest"

import { resolveJiraAssignee, resolveJiraTransition } from "./resolver"

describe("Jira resolver", () => {
  it("resolves a status target by transition name or target status", () => {
    expect(
      resolveJiraTransition(
        [
          { id: "11", name: "Start Progress", to: { name: "In Progress" } },
          { id: "31", name: "Done", to: { name: "Done" } },
        ],
        "done"
      )
    ).toMatchObject({
      transitionId: "31",
      warning: null,
    })
  })

  it("keeps status transitions blocked when Jira is ambiguous or unavailable", () => {
    expect(
      resolveJiraTransition(
        [
          { id: "31", name: "Done", to: { name: "Done" } },
          { id: "41", name: "Finish", to: { name: "Done" } },
        ],
        "Done"
      ).warning
    ).toMatch(/mehrdeutig/)

    expect(resolveJiraTransition([], "Done").warning).toMatch(/nicht verfuegbar/)
  })

  it("resolves assignable users only when the Jira account is clear", () => {
    expect(
      resolveJiraAssignee(
        [
          {
            accountId: "acc-1",
            emailAddress: "owner@example.com",
            displayName: "Owner",
            active: true,
          },
        ],
        "owner@example.com"
      )
    ).toMatchObject({
      accountId: "acc-1",
      displayName: "Owner",
      warning: null,
    })
  })

  it("keeps assignee assignment blocked for ambiguous or hidden results", () => {
    expect(
      resolveJiraAssignee(
        [
          { accountId: "acc-1", displayName: "Owner A", active: true },
          { accountId: "acc-2", displayName: "Owner B", active: true },
        ],
        "owner@example.com"
      ).warning
    ).toMatch(/mehrdeutig/)

    expect(resolveJiraAssignee([], "owner@example.com").warning).toMatch(
      /nicht assignable/
    )
  })
})
