import { NextResponse } from "next/server"

import { PROJECT_TYPE_CATALOG } from "@/lib/project-types/catalog"
import { METHOD_CATALOG } from "@/lib/methods/catalog"

/**
 * GET /api/project-types — read-only platform catalog (PROJ-6).
 * No auth required: the catalog is global, stateless, and contains no
 * tenant data. Tenant-level overrides come with PROJ-16.
 */
export function GET() {
  return NextResponse.json(
    {
      project_types: PROJECT_TYPE_CATALOG,
      methods: METHOD_CATALOG,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    }
  )
}
