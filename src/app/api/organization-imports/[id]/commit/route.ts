import { z } from "zod"

import { commitOrganizationImport } from "../../_commit"
import {
  readImport,
  requireOrganizationImportAdmin,
} from "../../_helpers"
import { apiError } from "../../../_lib/route-helpers"

const commitSchema = z.object({
  confirm: z.literal(true),
  dedup_strategy: z.enum(["skip", "update", "fail"]).optional(),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireOrganizationImportAdmin("write")
  if ("error" in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 400)
  }

  const parsed = commitSchema.safeParse(body)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }

  const result = await readImport(auth.supabase, auth.tenantId, id)
  if ("error" in result) return result.error

  return commitOrganizationImport({
    importRow: result.importRow,
    ctx: auth,
    dedupStrategy:
      parsed.data.dedup_strategy ?? result.importRow.dedup_strategy,
  })
}
