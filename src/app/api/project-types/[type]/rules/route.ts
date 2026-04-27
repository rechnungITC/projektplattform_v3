import { NextResponse } from "next/server"
import { z } from "zod"

import { apiError } from "@/app/api/_lib/route-helpers"
import { computeRules } from "@/lib/project-rules/engine"
import { PROJECT_METHODS, type ProjectMethod } from "@/types/project-method"
import { PROJECT_TYPES, type ProjectType } from "@/types/project"

/**
 * GET /api/project-types/[type]/rules?method=... — wizard preview (PROJ-6).
 * Returns `ProjectRules` for the (type, method) tuple. method is optional;
 * when omitted, starter_kinds is empty. No auth required.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ type: string }> }
) {
  const { type } = await context.params

  const typeParse = z
    .enum(PROJECT_TYPES as unknown as [string, ...string[]])
    .safeParse(type)
  if (!typeParse.success) {
    return apiError(
      "validation_error",
      "Unknown project type.",
      400,
      "type"
    )
  }

  const url = new URL(request.url)
  const methodRaw = url.searchParams.get("method")
  let method: ProjectMethod | null = null
  if (methodRaw) {
    const methodParse = z
      .enum(PROJECT_METHODS as unknown as [string, ...string[]])
      .safeParse(methodRaw)
    if (!methodParse.success) {
      return apiError(
        "validation_error",
        "Unknown method.",
        400,
        "method"
      )
    }
    method = methodParse.data as ProjectMethod
  }

  const rules = computeRules(typeParse.data as ProjectType, method)
  return NextResponse.json(
    { type: typeParse.data, method, rules },
    {
      status: 200,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    }
  )
}
