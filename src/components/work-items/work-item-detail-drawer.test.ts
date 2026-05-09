import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("WorkItemDetailDrawer markup", () => {
  it("renders parent breadcrumb description as a div to avoid badges inside a p", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/work-items/work-item-detail-drawer.tsx"),
      "utf8"
    )

    expect(source).toContain("<SheetDescription asChild>")
    expect(source).not.toContain("<SheetDescription>\n                  <span")
  })
})
