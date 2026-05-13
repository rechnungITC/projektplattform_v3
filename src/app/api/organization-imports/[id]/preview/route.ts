import { NextResponse } from "next/server"

import {
  readImport,
  requireOrganizationImportAdmin,
} from "../../_helpers"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const auth = await requireOrganizationImportAdmin("read")
  if ("error" in auth) return auth.error

  const result = await readImport(auth.supabase, auth.tenantId, id)
  if ("error" in result) return result.error

  return NextResponse.json({ import: result.importRow })
}
