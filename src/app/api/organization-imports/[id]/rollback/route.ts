import { z } from "zod"

import { rollbackOrganizationImport } from "../../_commit"
import {
  readImport,
  requireOrganizationImportAdmin,
} from "../../_helpers"
import { apiError } from "../../../_lib/route-helpers"

const rollbackSchema = z.object({
  confirm: z.literal(true),
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

  const parsed = rollbackSchema.safeParse(body)
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

  return rollbackOrganizationImport(result.importRow, auth)
}
