import { expect, test } from "@playwright/test"

test.describe("PROJ-37..41 / assistant core public surface", () => {
  test("API: POST /api/assistant/turns is auth-gated", async ({ request }) => {
    const response = await request.post("/api/assistant/turns", {
      data: {
        input_text: "Wie ist der Status?",
        modality: "text",
      },
      failOnStatusCode: false,
      maxRedirects: 0,
    })

    expect([307, 401]).toContain(response.status())
  })

  test("login page does not expose the authenticated Assistant launcher", async ({
    page,
  }) => {
    await page.goto("/login")
    await expect(page.getByRole("button", { name: "Assistant öffnen" })).toHaveCount(0)
  })
})
