import type { Page, Route } from "@playwright/test"

import {
  expect,
  hasAuthStorageState,
  test,
} from "./fixtures/auth-fixture"
import {
  E2E_PROJECT_ID,
  E2E_TENANT_ID,
  E2E_USER_ID,
} from "./fixtures/constants"

const STORY_A_ID = "00000000-0000-4000-8000-000000000251"
const STORY_B_ID = "00000000-0000-4000-8000-000000000252"
const SPRINT_ID = "00000000-0000-4000-8000-000000000253"
const NOW = "2026-06-05T08:00:00.000Z"
const TOGGLE_MODIFIER: "Control" | "Meta" =
  process.platform === "darwin" ? "Meta" : "Control"

test.describe("PROJ-25b / authenticated Backlog-Sprint DnD smoke", () => {
  test.skip(
    !hasAuthStorageState(),
    "Auth fixture not provisioned — see tests/fixtures/README.md.",
  )

  test("renders sprint DnD handles and announces Escape cancellation", async ({
    authenticatedPage,
  }) => {
    await mockBacklogDndData(authenticatedPage)
    await forceListView(authenticatedPage)

    await authenticatedPage.goto(`/projects/${E2E_PROJECT_ID}/backlog`, {
      waitUntil: "domcontentloaded",
    })

    const handle = authenticatedPage.getByRole("button", {
      name: "Story 'DnD Story A' verschieben",
    })
    await expect(handle).toBeVisible()

    await handle.focus()
    await authenticatedPage.keyboard.press("Space")
    await authenticatedPage.keyboard.press("Escape")

    await expect(
      authenticatedPage
        .locator('[role="status"]')
        .filter({ hasText: "Verschieben abgebrochen." }),
    ).toBeAttached()
  })

  test("marks Ctrl/Cmd and Shift range DnD selection in the real backlog list", async ({
    authenticatedPage,
  }) => {
    await mockBacklogDndData(authenticatedPage)
    await forceListView(authenticatedPage)

    await authenticatedPage.goto(`/projects/${E2E_PROJECT_ID}/backlog`, {
      waitUntil: "domcontentloaded",
    })

    const rowA = authenticatedPage.getByRole("row", {
      name: /Work Item: DnD Story A/,
    })
    const rowB = authenticatedPage.getByRole("row", {
      name: /Work Item: DnD Story B/,
    })

    await rowA.click({ modifiers: [TOGGLE_MODIFIER] })
    await rowB.click({ modifiers: ["Shift"] })

    await expect(rowA).toHaveAttribute("aria-selected", "true")
    await expect(rowB).toHaveAttribute("aria-selected", "true")
  })
})

async function forceListView(page: Page) {
  await page.addInitScript(
    ([userId, projectId]) => {
      window.localStorage.setItem(`wbs-view-mode-${userId}-${projectId}`, "list")
    },
    [E2E_USER_ID, E2E_PROJECT_ID],
  )
}

async function mockBacklogDndData(page: Page) {
  await page.route("**/api/projects/**/work-item-cost-totals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ totals: [] }),
    })
  })

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split("/").pop()

    if (table === "projects") {
      await fulfillJson(route, { project_method: null })
      return
    }

    if (table === "work_items") {
      const sprintFilter = url.searchParams.get("sprint_id")
      await fulfillJson(
        route,
        sprintFilter?.startsWith("eq.") ? [] : [workItemA(), workItemB()],
      )
      return
    }

    if (table === "sprints") {
      await fulfillJson(route, [sprint()])
      return
    }

    if (table === "phases") {
      await fulfillJson(route, [])
      return
    }

    await fulfillJson(route, [])
  })
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

function workItemA() {
  return workItem({
    id: STORY_A_ID,
    title: "DnD Story A",
    position: 1000,
  })
}

function workItemB() {
  return workItem({
    id: STORY_B_ID,
    title: "DnD Story B",
    position: 2000,
  })
}

function workItem({
  id,
  title,
  position,
}: {
  id: string
  title: string
  position: number
}) {
  return {
    id,
    tenant_id: E2E_TENANT_ID,
    project_id: E2E_PROJECT_ID,
    kind: "story",
    parent_id: null,
    phase_id: null,
    milestone_id: null,
    sprint_id: null,
    title,
    description: null,
    status: "todo",
    priority: "medium",
    responsible_user_id: null,
    attributes: {},
    position,
    created_from_proposal_id: null,
    created_by: E2E_USER_ID,
    created_at: NOW,
    updated_at: NOW,
    is_deleted: false,
    outline_path: null,
    wbs_code: null,
    wbs_code_is_custom: false,
    planned_start: null,
    planned_end: null,
    derived_planned_start: null,
    derived_planned_end: null,
    derived_estimate_hours: null,
    responsible: null,
  }
}

function sprint() {
  return {
    id: SPRINT_ID,
    tenant_id: E2E_TENANT_ID,
    project_id: E2E_PROJECT_ID,
    name: "Sprint DnD",
    goal: null,
    start_date: "2026-06-01",
    end_date: "2026-06-14",
    state: "planned",
    is_critical: false,
    created_by: E2E_USER_ID,
    created_at: NOW,
    updated_at: NOW,
  }
}
