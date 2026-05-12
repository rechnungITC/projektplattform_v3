import { expect, test } from "./fixtures/auth-fixture"
import { E2E_PROJECT_ID } from "./fixtures/constants"

test.describe("PROJ-58-θ / 3D graph renderer", () => {
  test("renders a non-empty 3D canvas with mocked graph data", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.route(
      `**/api/projects/${E2E_PROJECT_ID}/graph`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ graph: graphFixture }),
        })
      },
    )

    await authenticatedPage.goto(`/projects/${E2E_PROJECT_ID}/graph`, {
      waitUntil: "networkidle",
    })

    const canvasHost = authenticatedPage.getByTestId("project-graph-3d-canvas")
    await expect(canvasHost).toBeVisible()

    const canvas = canvasHost.locator("canvas")
    await expect(canvas).toBeVisible()

    const dataUrlLength = await canvas.evaluate(
      (element) => (element as HTMLCanvasElement).toDataURL("image/png").length,
    )
    expect(dataUrlLength).toBeGreaterThan(2_000)

    const screenshot = await canvas.screenshot()
    expect(screenshot.length).toBeGreaterThan(2_000)
  })
})

const graphFixture = {
  project_id: E2E_PROJECT_ID,
  generated_at: "2026-05-12T00:00:00.000Z",
  nodes: [
    graphNode("project:e2e", "project", "E2E Graph", "info"),
    graphNode("phase:plan", "phase", "Planung", "info"),
    graphNode("milestone:go", "milestone", "Go-live", "success", true),
    graphNode("work:api", "work_item", "API liefern", "warning", true),
    graphNode("work:ui", "work_item", "3D UI", "critical", true),
    graphNode("risk:scope", "risk", "Scope Risiko", "critical"),
    graphNode("decision:budget", "decision", "Budgetfreigabe", "warning"),
    graphNode("stakeholder:sponsor", "stakeholder", "Sponsor", "muted"),
    graphNode("budget:runway", "budget", "Runway", "success"),
    graphNode("rec:focus", "recommendation", "Blocker Review", "info"),
  ],
  edges: [
    graphEdge("e:project-phase", "project:e2e", "phase:plan", "belongs_to"),
    graphEdge("e:phase-ms", "phase:plan", "milestone:go", "belongs_to"),
    graphEdge("e:api-ui", "work:api", "work:ui", "blocks", "dep-e2e"),
    graphEdge("e:ui-ms", "work:ui", "milestone:go", "depends_on"),
    graphEdge("e:risk-ui", "risk:scope", "work:ui", "increases_risk"),
    graphEdge("e:decision-cost", "decision:budget", "budget:runway", "causes_cost"),
    graphEdge(
      "e:sponsor-decision",
      "stakeholder:sponsor",
      "decision:budget",
      "requires_stakeholder",
    ),
    graphEdge("e:rec-risk", "rec:focus", "risk:scope", "influences"),
  ],
  counts: {
    nodes: 10,
    edges: 8,
    by_node_kind: {
      project: 1,
      phase: 1,
      milestone: 1,
      work_item: 2,
      risk: 1,
      decision: 1,
      stakeholder: 1,
      budget: 1,
      recommendation: 1,
    },
    by_edge_kind: {
      belongs_to: 2,
      blocks: 1,
      depends_on: 1,
      increases_risk: 1,
      causes_cost: 1,
      requires_stakeholder: 1,
      influences: 1,
    },
  },
}

function graphNode(
  id: string,
  kind: string,
  label: string,
  tone: string,
  critical = false,
) {
  return {
    id,
    kind,
    label,
    detail: null,
    tone,
    href: null,
    attributes: critical ? { is_critical: true } : {},
  }
}

function graphEdge(
  id: string,
  source_node_id: string,
  target_node_id: string,
  kind: string,
  dependency_id: string | null = null,
) {
  return {
    id,
    source_node_id,
    target_node_id,
    kind,
    label: null,
    dependency_id,
  }
}
