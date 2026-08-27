/**
 * PROJ-151-α — Vorprüfung einer Eingabe (AC-151.9, Lock L3).
 *
 * Eigene Route, weil der Detektor serverseitig liegt (PROJ-86) und die Warnung
 * VOR dem Senden erscheinen soll. Sie hält niemanden auf — sie sagt nur, was
 * gleich passiert. Das Senden bleibt in jedem Fall möglich.
 *
 * Die Eingabe wird **nicht gespeichert**: eine Vorprüfung, die den Text
 * ablegt, wäre genau der Datenabfluss, vor dem sie warnt.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { checkProjectChatInput } from "@/lib/ai/classify-project-chat"
import { requireModuleActive } from "@/lib/tenant-settings/server"

const CheckSchema = z.object({ content: z.string().max(8000) })

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("validation_error", "Invalid project id.", 400, "id")
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)
  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const gate = await requireModuleActive(supabase, access.project.tenant_id, "ai_chat")
  if (gate) return gate

  const parsed = CheckSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return apiError("validation_error", "Invalid body.", 422)

  const check = checkProjectChatInput(parsed.data.content)
  return NextResponse.json({
    looks_personal: check.looks_personal,
    // Das Senden bleibt erlaubt — die Warnung ist ein Hinweis, kein Riegel (L3).
    blocks_sending: false,
  })
}
